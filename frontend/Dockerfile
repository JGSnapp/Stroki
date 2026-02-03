FROM node:18-bookworm

WORKDIR /usr/src/app

# Install openssl to generate a self-signed certificate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

# Generate a self-signed certificate for HTTPS dev server (with SAN)
RUN mkdir -p /certs \
  && openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout /certs/server.key \
    -out /certs/server.crt \
    -days 365 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost"

# Configure CRA to use HTTPS with the generated cert
ENV HTTPS=true \
    SSL_CRT_FILE=/certs/server.crt \
    SSL_KEY_FILE=/certs/server.key \
    HOST=0.0.0.0 \
    PORT=3000 \
    BROWSER=none \
    DANGEROUSLY_DISABLE_HOST_CHECK=true \
    NODE_OPTIONS=--max-old-space-size=512

EXPOSE 3000

CMD ["npm", "start"]
