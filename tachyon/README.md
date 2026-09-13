# Tachyon Home Assistant add-on

Tachyon — быстрый self-hosted web-клиент для IMAP/SMTP, контактов и календарей.

## Настройки

- `debug` — подробный вывод запуска (по умолчанию `false`).
- `upload_max_size` — максимальный размер вложения PHP/nginx (по умолчанию `25M`).
- `memory_limit` — лимит памяти PHP (по умолчанию `128M`).
- `secure_cookies` — флаг secure для cookie (по умолчанию `true`).

Данные хранятся в постоянном volume `/var/lib/tachyon`, который объявлен upstream-образом Tachyon. Пароль панели администратора находится в `admin_password.txt` внутри данных Tachyon после первого запуска.

## Порт

Web-интерфейс слушает внутренний порт `8888`. Порт можно изменить в настройках сети Home Assistant.
