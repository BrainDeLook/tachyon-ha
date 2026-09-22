<?php

// Patch the two small upstream assumptions that prevent Home Assistant Ingress.
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
    $cacheReplacement = "Utils::jsonEncode(array(\n\t\t\t\t\tUtils::WebPath(),\n\t\t\t\t\t\$sLanguage,";
    replaceOnce($serviceFile, $cacheNeedle, $cacheReplacement);

    $templateFile = dirname($apiFile, 3) . '/templates/Index.html';
    $fetchScript = file_get_contents('/usr/local/share/ha-tachyon-ingress-fetch.js');
    if ($fetchScript === false) {
        fwrite(STDERR, "Ingress fetch script not found\n");
        exit(1);
    }
    $bootNeedle = '<script nonce="" type="text/javascript">{{BaseAppBootScript}}{{BaseLanguage}}</script>';
    $bootReplacement = '<script nonce="" type="text/javascript">' . "\n" . $fetchScript . "\n</script>\n\t" . $bootNeedle;
    replaceOnce($templateFile, $bootNeedle, $bootReplacement);
}

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
