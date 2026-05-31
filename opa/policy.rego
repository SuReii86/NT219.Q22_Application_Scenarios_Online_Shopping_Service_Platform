package envoy.authz

import future.keywords.if

default allow := false

allow if is_health_check
allow if is_public_catalog
allow if is_public_inventory
allow if is_stripe_webhook
allow if is_authenticated_api
allow if is_admin_api

http := input.attributes.request.http

method := upper(object.get(http, "method", ""))

raw_path := object.get(http, "path", "")

clean_path := trim(split(raw_path, "?")[0], "/")

path := split(clean_path, "/")

headers := object.get(http, "headers", {})

authorization := lower(object.get(headers, "authorization", ""))

has_bearer_token if {
  startswith(authorization, "bearer ")
}

# =========================
# Public routes
# =========================

is_health_check if {
  method == "GET"
  count(path) == 3
  path[0] == "api"
  path[2] == "health"
}

is_public_catalog if {
  method == "GET"
  path == ["api", "catalog", "products"]
}

is_public_catalog if {
  method == "GET"
  count(path) == 4
  path[0] == "api"
  path[1] == "catalog"
  path[2] == "products"
}

is_public_inventory if {
  method == "GET"
  count(path) == 3
  path[0] == "api"
  path[1] == "inventory"
}

# Stripe webhook public ở gateway.
# Payment-service sẽ verify chữ ký webhook bằng STRIPE_WEBHOOK_SECRET.
is_stripe_webhook if {
  method == "POST"
  path == ["api", "payment", "webhook"]
}

# =========================
# Authenticated customer routes
# OPA ở gateway chỉ kiểm tra có Bearer token.
# JWT thật vẫn được verify trong microservice bằng JWKS Keycloak.
# =========================

is_authenticated_api if {
  has_bearer_token
  authenticated_route
}

authenticated_route if {
  method == "GET"
  path == ["api", "users", "me"]
}

authenticated_route if {
  method == "PUT"
  path == ["api", "users", "me"]
}

authenticated_route if {
  method == "GET"
  path == ["api", "cart"]
}

authenticated_route if {
  method == "DELETE"
  path == ["api", "cart"]
}

authenticated_route if {
  method == "POST"
  path == ["api", "cart", "items"]
}

authenticated_route if {
  method == "PATCH"
  count(path) == 4
  path[0] == "api"
  path[1] == "cart"
  path[2] == "items"
}

authenticated_route if {
  method == "DELETE"
  count(path) == 4
  path[0] == "api"
  path[1] == "cart"
  path[2] == "items"
}

authenticated_route if {
  method == "GET"
  path == ["api", "orders"]
}

authenticated_route if {
  method == "GET"
  count(path) == 3
  path[0] == "api"
  path[1] == "orders"
}

authenticated_route if {
  method == "POST"
  path == ["api", "orders", "checkout"]
}

authenticated_route if {
  method == "POST"
  path == ["api", "payment", "create-intent"]
}

authenticated_route if {
  method == "GET"
  count(path) == 4
  path[0] == "api"
  path[1] == "payment"
  path[2] == "orders"
}

# Route demo Postman.
# Production có thể xóa rule này.
authenticated_route if {
  method == "POST"
  count(path) == 4
  path[0] == "api"
  path[1] == "payment"
  path[2] == "test-confirm"
}

authenticated_route if {
  method == "GET"
  path == ["api", "shipping", "mine"]
}

authenticated_route if {
  method == "GET"
  count(path) == 4
  path[0] == "api"
  path[1] == "shipping"
  path[2] == "orders"
}

authenticated_route if {
  method == "GET"
  path == ["api", "notifications", "mine"]
}

# =========================
# Admin routes
# OPA chỉ kiểm tra có Bearer token.
# Role admin vẫn để service kiểm tra bằng requireRole('admin').
# =========================

is_admin_api if {
  has_bearer_token
  admin_route
}

admin_route if {
  method == "POST"
  path == ["api", "catalog", "products"]
}

admin_route if {
  method == "PUT"
  count(path) == 4
  path[0] == "api"
  path[1] == "catalog"
  path[2] == "products"
}

admin_route if {
  method == "GET"
  path == ["api", "users", "admin", "users"]
}

# =========================
# Internal routes
# =========================
# Không tạo allow rule cho /internal/...
# Vì internal routes không nên đi qua public gateway.
# Service-to-service sẽ gọi trực tiếp bằng x-internal-token.