ARG BUILD_FROM
FROM ${BUILD_FROM}

ARG BUILD_VERSION
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY

# Home Assistant mounts the add-on data directory at /data. Tachyon's
# upstream image persists its state in /var/lib/tachyon, so point that path
# at the add-on data volume.
RUN rm -rf /var/lib/tachyon && ln -s /data /var/lib/tachyon

COPY rootfs/ /
RUN chmod 0755 /usr/local/bin/ha-tachyon-entrypoint

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
ENTRYPOINT ["/usr/local/bin/ha-tachyon-entrypoint"]
