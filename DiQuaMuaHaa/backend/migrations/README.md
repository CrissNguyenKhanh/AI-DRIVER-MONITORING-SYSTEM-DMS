# Migration bảo mật V3

Các file `*.up.sql` là migration thuận; `*.down.sql` chỉ phục vụ rollback có chủ đích.
Chạy theo thứ tự phiên bản: `V001` trước `V002`.
Không chạy tự động trong request và không chạy trên dữ liệu production từ repository này.

Trên database kiểm thử biệt lập:

```powershell
# MySQL/MariaDB
Get-Content -Raw migrations/mysql/V001__verification_grants.up.sql |
  mysql -h localhost -u root -p diquamuaha

# PostgreSQL
psql $env:TEST_DATABASE_URL `
  -f migrations/postgres/V001__verification_grants.up.sql
```

Trước khi chạy cần backup, xác nhận đúng database, và dùng tài khoản chỉ có quyền trên
database kiểm thử. Migration tạo challenge, one-time grant và audit log; route bắt đầu
phiên không còn gọi lazy DDL để tránh `commit()` ngoài ý muốn trong transaction consume.
`V002` chỉ thêm metadata version/status cho hồ sơ sinh trắc học, không rewrite hoặc xóa
`embedding_json`/`image_base64` legacy. Cleanup dữ liệu cũ cần một quy trình được phê duyệt riêng.

Rollback xóa dữ liệu audit/grant nên chỉ chạy trên môi trường kiểm thử hoặc sau khi đã
backup và được phê duyệt rõ ràng.
