# connect-backend-go

Example Golang backend for pgport Connect feature

## Usage

Run the backend:

```bash
go run main.go
```

Configure pgport:

```bash
pgport --sessions --connect-backend=http://localhost:4567 --connect-token=test
```
