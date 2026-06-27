# Failure Corpus: Destruktive Operationen

## Muss exakt bleiben

- rm -rf /srv/prod/uploads --one-file-system
- kubectl delete namespace billing-prod --wait=false
- terraform destroy -target=module.payments-prod --auto-approve
- aws s3 rm s3://billing-prod-ledger --recursive --exclude "*.keep"
- git reset --hard origin/main

## Warum das kritisch ist

Das Zielverzeichnis entscheidet, ob Cache oder produktive Nutzerdaten geloescht werden.
Der Kubernetes-Namespace bestimmt, ob Test- oder Produktionsressourcen entfernt werden.
Der Terraform-Target begrenzt oder erweitert den Zerstoerungsradius.
Die S3-Option --recursive entscheidet, ob einzelne Objekte oder ganze Prefixe geloescht werden.
Der Git-Reset auf origin/main verwirft lokale Aenderungen unwiderruflich.

## Rauschen

Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
Die Deployment-Notiz wiederholt allgemeine Rollback-Hinweise.
