# ------------------------------------------------------------------------------
# Builder Stage
# ------------------------------------------------------------------------------
FROM golang:1.25-trixie AS build

ARG CGO_ENABLED=0
ENV CGO_ENABLED=${CGO_ENABLED}

WORKDIR /build

RUN git config --global --add safe.directory /build
COPY go.mod go.sum ./
RUN go mod download
COPY Makefile main.go ./
COPY static/ static/
COPY pkg/ pkg/
COPY .git/ .
RUN make build

# ------------------------------------------------------------------------------
# Release Stage — binary only
# ------------------------------------------------------------------------------
FROM scratch

# TLS root certificates for SSL connections to PostgreSQL
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Timezone database for correct timestamp handling
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo

COPY --from=build /build/pgport /usr/bin/pgport

USER 1000

EXPOSE 8081
ENTRYPOINT ["/usr/bin/pgport", "--bind=0.0.0.0", "--listen=8081"]
