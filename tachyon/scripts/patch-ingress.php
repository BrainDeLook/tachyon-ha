<?php

// Patch upstream assumptions that prevent Home Assistant Ingress.
// Fail the image build if Tachyon changes those lines instead of shipping an
// image whose UI silently breaks after an upstream update.
$versions = glob('/tachyon/tachyon/v/*/app/libraries/Tachyon/Api.php');
if (!$versions) {
    fwrite(STDERR, "Tachyon API source not found\n");
    exit(1);
}

foreach ($versions as $apiFile) {
    $apiNeedle = <<<'PHP'
$CSP = new \Tachyon\Util\HTTP\CSP(\trim($oConfig->Get('security', 'content_security_policy', '')));
PHP;
    $apiAddition = <<<'PHP'

		if (\defined('HA_TACHYON_INGRESS') && !$CSP->get('frame-ancestors')) {
			$CSP->add('frame-ancestors', "'self'");
		}
PHP;
    replaceOnce($apiFile, $apiNeedle, $apiNeedle . $apiAddition);

    $serviceFile = dirname($apiFile) . '/Service.php';
    $cacheNeedle = "Utils::jsonEncode(array(\n\t\t\t\t\t\$sLanguage,";
    // The rendered index is cached on disk across add-on upgrades. Include
    // the image version so a previously cached page cannot hide a new shim.
    $cacheReplacement = "Utils::jsonEncode(array(\n\t\t\t\t\tUtils::WebPath(),\n\t\t\t\t\tgetenv('BUILD_VERSION'),\n\t\t\t\t\t\$sLanguage,";
    replaceOnce($serviceFile, $cacheNeedle, $cacheReplacement);
    $proxyQueryNeedle = <<<'PHP'
		$sQuery = \trim(\trim($sQuery), ' /');
PHP;
    $proxyQueryFix = <<<'PHP'
		// Home Assistant Ingress reserializes bare query paths as key=value.
		// Recover only Tachyon's external-image route from the parsed key.
		if (\defined('HA_TACHYON_INGRESS')) {
			foreach (\array_keys($_GET) as $sKey) {
				if (\preg_match('#^/?ProxyExternal/([A-Za-z0-9_-]+)$#D', $sKey, $aProxyMatch)) {
					$sQuery = 'ProxyExternal/'.$aProxyMatch[1];
					break;
				}
			}
			if (\preg_match('#^ProxyExternal/([A-Za-z0-9_-]+)=?$#D', $sQuery, $aProxyMatch)) {
				$sQuery = 'ProxyExternal/'.$aProxyMatch[1];
			}
		}
PHP;
    replaceOnce($serviceFile, $proxyQueryNeedle, $proxyQueryNeedle . "\n" . $proxyQueryFix);
    // The persistent data volume can still supply an old rendered page after
    // an image upgrade. Always render the ingress page from this image.
    replaceOnce(
        $serviceFile,
        "if (\$oConfig->Get('cache', 'system_data', true)) {",
        "if (!\\defined('HA_TACHYON_INGRESS') && \$oConfig->Get('cache', 'system_data', true)) {"
    );
    replaceOnce(
        $serviceFile,
        'if ($sCacheFileName) {',
        "if (!\\defined('HA_TACHYON_INGRESS') && \$sCacheFileName) {"
    );
    $renderNeedle = '$sResult = \strtr($sResult, $aTemplateParameters);';
    $renderAddition = <<<'PHP'
				$aTemplateParameters['{{HAIngressKiosk}}'] = \defined('HA_TACHYON_INGRESS') ? 'true' : 'false';
PHP;
    replaceOnce($serviceFile, $renderNeedle, $renderAddition . "\n" . $renderNeedle);

    $templateFile = dirname($apiFile, 3) . '/templates/Index.html';
    $fetchScript = file_get_contents('/usr/local/share/ha-tachyon-ingress-fetch.js');
    $kioskScript = file_get_contents('/usr/local/share/ha-tachyon-kiosk.js');
    if ($fetchScript === false || $kioskScript === false) {
        fwrite(STDERR, "Ingress browser script not found\n");
        exit(1);
    }
    $bootNeedle = '<script nonce="" type="text/javascript">{{BaseAppBootScript}}{{BaseLanguage}}</script>';
    $bootReplacement = '<script nonce="" type="text/javascript">' . "\n" . $fetchScript . "\n</script>\n\t"
        . '<script nonce="" type="text/javascript">' . "\n" . $kioskScript . "\n</script>\n\t" . $bootNeedle;
    replaceOnce($templateFile, $bootNeedle, $bootReplacement);

    // Serve prefetched recent INBOX messages from the persistent add-on cache.
    // Other folders, uncached messages, and disabled caching keep upstream IMAP.
    $messagesFile = dirname($apiFile) . '/Actions/Messages.php';
    $messageNeedle = <<<'PHP'
		$oAccount = $this->initMailClientConnection();

		try
		{
			$oMessage = $this->MailClient()->Message($sFolder, $iUid, true, $this->Cacher($oAccount));
PHP;
    $messageReplacement = <<<'PHP'
		if ('INBOX' === $sFolder && $iUid > 0) {
			$aHaOptions = json_decode(@file_get_contents('/data/options.json') ?: '', true);
			$oHaAccount = $this->getAccountFromToken(false);
			$sHaEmail = $oHaAccount ? strtolower($oHaAccount->Email()) : '';
			if (is_array($aHaOptions) && !empty($aHaOptions['gmail_cache_enabled'])
				&& $sHaEmail && $sHaEmail === strtolower($aHaOptions['gmail_cache_email'] ?? '')) {
				$sHaCache = '/data/tachyon/ha-message-cache/' . hash('sha256', $sHaEmail) . '/' . $iUid . '.json';
				if (is_file($sHaCache)) {
					$aHaCachedMessage = json_decode(@file_get_contents($sHaCache) ?: '', true);
					if (is_array($aHaCachedMessage) && ($aHaCachedMessage['folder'] ?? null) === 'INBOX'
						&& ($aHaCachedMessage['uid'] ?? null) === $iUid) {
						header('X-HA-Mail-Cache: HIT');
						return $this->DefaultResponse($aHaCachedMessage);
					}
				}
			}
		}

		$oAccount = $this->initMailClientConnection();

		try
		{
			$oMessage = $this->MailClient()->Message($sFolder, $iUid, true, $this->Cacher($oAccount));
PHP;
    replaceOnce($messagesFile, $messageNeedle, $messageReplacement);
}

// The upstream startup script also hard-codes the Docker volume path. Point
// its permission, config, and admin-password handling at the HA data mount.
replaceAll('/entrypoint.sh', '/var/lib/tachyon', '/data/tachyon', 6);

function replaceOnce(string $file, string $needle, string $replacement): void
{
    $source = file_get_contents($file);
    if ($source === false || substr_count($source, $needle) !== 1) {
        fwrite(STDERR, "Unexpected Tachyon source in {$file}\n");
        exit(1);
    }
    if (file_put_contents($file, str_replace($needle, $replacement, $source)) === false) {
        fwrite(STDERR, "Cannot patch {$file}\n");
        exit(1);
    }
}

function replaceAll(string $file, string $needle, string $replacement, int $expectedCount): void
{
    $source = file_get_contents($file);
    if ($source === false || substr_count($source, $needle) !== $expectedCount) {
        fwrite(STDERR, "Unexpected Tachyon startup script in {$file}\n");
        exit(1);
    }
    if (file_put_contents($file, str_replace($needle, $replacement, $source)) === false) {
        fwrite(STDERR, "Cannot patch {$file}\n");
        exit(1);
    }
}
