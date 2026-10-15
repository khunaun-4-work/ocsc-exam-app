# Build stage
FROM rust:1.80-slim as builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release || true

COPY src ./src
RUN touch src/main.rs
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/ocsc_exam_system /app/ocsc_exam_system
COPY frontend /app/frontend
COPY seed_data.json /app/seed_data.json

ENV PORT=8000
EXPOSE 8000

CMD ["/app/ocsc_exam_system"]
