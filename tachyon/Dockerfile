ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache python3

ARG BUILD_VERSION
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY

COPY rootfs/ /
COPY scripts/patch-ingress.php /usr/local/bin/ha-tachyon-patch-ingress.php
COPY scripts/cache-worker.py /usr/local/bin/ha-tachyon-cache-worker.py
COPY scripts/supervisor-cache.conf /tmp/ha-tachyon-supervisor-cache.conf
RUN php /usr/local/bin/ha-tachyon-patch-ingress.php \
  && cat /tmp/ha-tachyon-supervisor-cache.conf >> /supervisor.conf \
  && python3 -m py_compile /usr/local/bin/ha-tachyon-cache-worker.py \
  && chown www-data:www-data /tachyon/include.php \
  && chmod 0440 /tachyon/include.php \
  && chmod 0755 /usr/local/bin/ha-tachyon-entrypoint

ENV BUILD_VERSION="${BUILD_VERSION}"
LABEL \
  io.hass.type="addon" \
  io.hass.name="${BUILD_NAME}" \
  io.hass.description="${BUILD_DESCRIPTION}" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.version="${BUILD_VERSION}" \
  org.opencontainers.image.title="${BUILD_NAME}" \
  org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
  org.opencontainers.image.source="https://github.com/${BUILD_REPOSITORY}" \
  org.opencontainers.image.revision="${BUILD_REF}" \
  org.opencontainers.image.created="${BUILD_DATE}"

WORKDIR /tachyon
EXPOSE 8888
ENTRYPOINT ["/usr/local/bin/ha-tachyon-entrypoint"]
