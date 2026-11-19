# infra

Local Kubernetes manifests and setup using cdk8s and k3d.
See `README.md` for prerequisites and the manual deployment order.

## Layout

- `src/main.ts`: synthesizes manifests for the selected environment.
- `src/apps/`: charts and renderers for databases, applications and RabbitMQ.
- `src/imports/rabbitmq.com.ts`: generated types from the RabbitMQ Cluster Operator CRD.
- `dist/local/`: generated manifests; do not edit them by hand.
- `src/apps/rabbitmq/setup.mjs`: setup Job script for the vhost, application user
  and permissions.

## Rules

- Only the `local` environment is currently supported.
- RabbitMQ Cluster Operator manages the broker; the setup Job manages its vhost,
  application user and permissions. Server and Worker declare the queue topology.
- When changing queue or exchange names, review the setup Job permissions.
- Do not edit generated CRD types by hand; regenerate them from the intended
  operator version. Generated imports are excluded from linting and formatting.
- Run migrations and optional seeds as separate Jobs; never reset databases or
  delete PVCs as part of application startup.
- Secrets and private keys stay outside Git. Preserve existing credentials and
  data when working with an existing cluster.
