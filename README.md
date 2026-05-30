<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

GoldSushi - A modern food delivery application built with NestJS framework.

## Features

- 🔐 Authentication & Authorization (JWT)
- 🛒 Shopping Cart Management
- 📦 Order Processing
- 💳 Payment Integration (LiqPay)
- 🎟️ Promotions & Promo Codes
- 📸 Image Upload (Cloudinary)
- 📧 Email Notifications
- 🗂️ Category & Product Management
- 📊 Swagger API Documentation

## Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Docker & Docker Compose (for containerized deployment)

## Installation

```bash
$ npm install
```

## Environment Setup

1. Copy the example environment file:
```bash
$ cp .env.example .env
```

2. Update the `.env` file with your configuration values.

## Running the app

### Local Development

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

### Docker Development

```bash
# Build and start all services (app + postgres)
$ docker-compose up -d

# View logs
$ docker-compose logs -f

# Stop services
$ docker-compose down
```

### Quick Local Build

```bash
# Build Docker image and optionally start services
$ ./build-local.sh
```

## 🚀 Docker Deployment to Digital Ocean

This application is fully configured for Docker deployment on Digital Ocean droplets.

### Quick Start

1. **Build the Docker image:**
```bash
docker build -t goldsushi:latest .
```

2. **Test locally with Docker Compose:**
```bash
docker-compose up -d
```

3. **Deploy to Digital Ocean:**
```bash
# Set environment variables
export DOCKER_REGISTRY="ghcr.io/yourusername"
export DROPLET_IP="your-droplet-ip"
export SSH_USER="root"

# Run deployment script
./deploy.sh production
```

### Full Deployment Guide

For detailed deployment instructions, SSL setup, monitoring, and troubleshooting, see:
📖 **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Deployment Files

- `Dockerfile` - Multi-stage production build
- `docker-compose.yml` - Local development with database
- `docker-compose.prod.yml` - Production deployment
- `nginx.conf` - Reverse proxy configuration
- `.dockerignore` - Docker build exclusions
- `deploy.sh` - Automated deployment script
- `.github/workflows/deploy.yml` - CI/CD pipeline

### Production Features

✅ Multi-stage Docker build for optimized image size  
✅ Non-root user for security  
✅ Health checks configured  
✅ Nginx reverse proxy with rate limiting  
✅ HTTPS/SSL support  
✅ Automated deployment script  
✅ GitHub Actions CI/CD pipeline  
✅ Log rotation  
✅ Horizontal scaling ready  

## API Documentation

Once running, access Swagger documentation at:
- Local: http://localhost:4200/swagger
- Production: https://yourdomain.com/swagger

## Online Payments (Monobank)

Card payments are processed through the [Monobank Acquiring API](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create).

### Configuration

Add the following variables to your `.env` (see `.env.example`):

| Variable | Description |
| --- | --- |
| `MONOBANK_TOKEN` | Merchant token from the Monobank web cabinet (Acquiring → API token). **Required.** |
| `MONOBANK_API_URL` | API base URL. Defaults to `https://api.monobank.ua`. |
| `MONOBANK_INVOICE_VALIDITY` | Invoice lifetime in seconds. Defaults to `3600`. |
| `PUBLIC_API_URL` | Publicly reachable base URL of this API, used to build the webhook URL. |
| `MONOBANK_WEBHOOK_URL` | Explicit webhook URL. Overrides the value derived from `PUBLIC_API_URL`. |
| `PAYMENT_REDIRECT_URL` | Where the customer is redirected after paying. Falls back to `FRONTEND_URL`. |

> The webhook endpoint must be reachable from the public internet for Monobank
> to deliver payment status updates.

### Payment flow

1. Create an order with `paymentType` set to `2` (`PaymentType.Online`).
2. Start the payment to obtain the hosted Monobank payment page:

   ```http
   POST /api/payments/monobank/create/:orderId
   ```

   Returns `{ invoiceId, pageUrl, orderId }`. Redirect the customer to `pageUrl`.
3. Monobank notifies the API about status changes via a signed webhook
   (`POST /api/payments/monobank/webhook`). The signature (`X-Sign` header) is
   verified against the Monobank public key before the order is updated.
4. Poll or read the latest status (also refreshed from Monobank) with:

   ```http
   GET /api/payments/monobank/status/:orderId
   ```

   Returns `{ orderId, invoiceId, paymentStatus }`.

The order's `paymentStatus` reflects the Monobank invoice lifecycle:
`none → created → processing → hold → success | failure | reversed | expired`.

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
