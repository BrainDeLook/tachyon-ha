<?php

define('APP_DATA_FOLDER_PATH', '/data/tachyon/');

// Home Assistant serves Ingress under a session-specific URL prefix. Tachyon
// normally derives its public path from SCRIPT_NAME, which is /index.php
// behind the proxy. Preserve the proxy prefix for generated asset/API URLs.
$ingressPath = $_SERVER['HTTP_X_INGRESS_PATH'] ?? '';
if (is_string($ingressPath)
    && preg_match('#^/api/hassio_ingress/[A-Za-z0-9_-]+/?$#D', $ingressPath)) {
    define('HA_TACHYON_INGRESS', true);
    $_SERVER['SCRIPT_NAME'] = rtrim($ingressPath, '/') . '/index.php';
}
