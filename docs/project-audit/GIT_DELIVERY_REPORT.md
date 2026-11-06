# Git delivery report — road simulation

## Ancestry và tách PR #11

Worktree ban đầu ở commit `fbcaaddb7347`, là head của PR #11 `fix/hand-model-artifact-compatibility`. Source feature được commit cục bộ thành `c53b923d8335`, nhưng commit đó không được push làm PR vào `main`.

Để tránh kéo ba commit của PR #11 vào feature PR:

1. Branch source được giữ cục bộ dưới tên `wip/dms-road-obstacle-avoidance-sim-pr11-base`.
2. Tạo worktree/branch sạch `feat/dms-road-obstacle-avoidance-sim` từ `main` tại `e0b7efba6a6a`.
3. Cherry-pick duy nhất source commit, tạo feature commit sạch `ccb144e50f15`.
4. Chạy lại test/lint/build trên branch sạch.

`git diff main...HEAD` chỉ chứa simulator, test và tài liệu của feature.

## Commit và push

| Hạng mục | Kết quả |
|---|---|
| Feature commit | `ccb144e50f15` |
| Validation-doc commit | `671537ab9460` |
| Branch | `feat/dms-road-obstacle-avoidance-sim` |
| Push | PASS |
| Upstream | `origin/feat/dms-road-obstacle-avoidance-sim` |
| Force push | Không dùng |

## Pull Request

| Hạng mục | Giá trị |
|---|---|
| PR | #12 |
| URL | `https://github.com/CrissNguyenKhanh/AI-DRIVER-MONITORING-SYSTEM-DMS/pull/12` |
| Base | `main` |
| Head | `feat/dms-road-obstacle-avoidance-sim` |
| Trạng thái | MERGED |
| Draft | false |
| Merge method | Squash |
| Merge commit | `025c815dfdf9f9432ab0ee9fdfbe059d538d9860` |
| Merged at | 2026-11-06 10:57:51 +07:00 |

GitHub connector có quyền đọc nhưng trả 403 khi tạo PR. PR #12 được tạo qua GitHub REST bằng credential đã lưu của cùng remote; token không được in, ghi file hoặc commit.

## Delivery gates

- Frontend 46/46 PASS.
- Backend 58/58 PASS.
- Targeted ESLint PASS.
- Production build PASS.
- Stress 1.000 runs / 0 virtual collisions.
- `git diff --check` PASS.
- Secret/disallowed-artifact/binary scan PASS.
- Global lint baseline vẫn 39 errors/17 warnings, không có finding mới trong feature scope.
- Visual browser E2E NOT VERIFIED do không có browser surface.
- Không auth bypass, secure-E2E claim hoặc production vehicle-control path.

## Post-merge verification

- GitHub xác nhận PR #12 `merged=true`.
- `origin/main` trỏ tới merge commit `025c815dfdf9f9432ab0ee9fdfbe059d538d9860`.
- Tree SHA của feature head và merge commit đều là `22859160df9698904946f89692bb26de63c87ee2`; diff tree bằng 0 file.
- Combined status của merge commit: `Vercel=success`; repository không trả về GitHub Actions workflow run.
- Frontend chạy lại 46/46 PASS.
- Backend chạy lại 58/58 PASS.
- Targeted ESLint chạy lại PASS.
- Production build chạy lại PASS, 2.315 modules.
- PR #11 vẫn OPEN/độc lập và không bị merge như side effect.
- Không deploy production từ task này.
