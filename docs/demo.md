# Walkthrough trên Windows

## Thử bằng Chrome

Dùng một profile Chrome riêng và Load unpacked thư mục `web-extension\dist` theo [README](../README.md). Dừng backend cá nhân trên cổng 8000 trước khi thử.

Mở PowerShell tại thư mục dự án và chạy chương trình phục vụ hai trang mẫu:

```powershell
.\backend\.venv\Scripts\python.exe -m http.server 8765 --bind 127.0.0.1 --directory demo
```

Mở cửa sổ PowerShell thứ hai tại thư mục dự án và khởi động backend demo với dữ liệu riêng:

```powershell
Set-Location backend
$env:BROWSER_BRAIN_PROVIDER = 'fixture'
$env:BROWSER_BRAIN_DATA = Join-Path (Split-Path -Parent $PWD.Path) '.local\manual-demo'
$env:QDRANT_URL = ''
uv run --locked python src/main.py
```

1. Mở popup, thấy **Connected · fixture mode**, rồi chọn **Enable capture**. Dừng backend bằng **Ctrl+C** để tạo lỗi mạng.
2. Trong cùng tab, mở `http://127.0.0.1:8765/alpha.html?edition=lab#shared`, đọc đoạn về cobalt lantern, rồi nhấp **Open marsh notes**. Hai trang có cùng một đoạn và mỗi trang có ghi chú riêng.
3. Đợi popup hiện **Backend unreachable. Waiting to retry.** và số upload chờ. Đóng popup. Trong `chrome://extensions`, nhấn **Reload** cho Browser Brain để khởi động lại extension.
4. Chạy lại backend fixture. Mở popup và đợi upload chờ về 0. Hỏi **What does the cobalt lantern protocol record?**. Hai thẻ phải mở đúng URL có query và fragment, mỗi thẻ hiển thị **Viewed** theo lần quan sát tương ứng.
5. Sau demo, dùng **Clear history** để thử xóa index, chat và hàng đợi của profile demo. Nếu backend đang tắt, khởi động lại rồi chọn **Finish clearing**.

## Walkthrough và workload tự động

Từ thư mục dự án, chạy:

```powershell
node demo/walkthrough.mjs
```

Script mở Chrome headless với profile mới trong `.local`, nạp đúng thư mục `dist`, chạy FastAPI với Qdrant local mode và hai trang fixture. Nó thêm một bản sao đoạn DOM vào trang đầu, điều hướng trong cùng tab bằng liên kết, rồi ngắt giữa chừng phản hồi của lần upload đầu sau khi backend đã xác nhận ghi. Sau đó script dừng worker, mở lại giao diện popup, đợi hàng đợi rỗng, hỏi về đoạn trùng và nhấp một thẻ nguồn. Script kiểm tra cả URL đích lẫn thời điểm quan sát. Cổng 8000, 8001 và 8765 cần trống. Nếu cài Chrome hoặc Python ở vị trí khác, đặt `BROWSER_BRAIN_CHROME` và `BROWSER_BRAIN_PYTHON` trỏ tới file thực thi.

Workload ghi từng request, số batch khác nhau, kết quả phục hồi, số point thực trong Qdrant và bản ghi logic trùng. Độ trễ từng đoạn tính từ `captured_at` tới `indexed_at`, gồm thời gian gom batch. Kết quả dùng embedding fixture theo từ khóa để kiểm tra đường truyền, truy xuất và tính nhất quán. Thời gian tìm nguồn của người dùng được đo riêng theo [quy trình nghiên cứu](evaluation.md).

## Kết quả ngày 12/11/2026

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd run typecheck` và `npm.cmd run build` | Qua. Build ở `web-extension/dist`. |
| `npm.cmd test` | 11/11, gồm Unicode/URL, hàng đợi và packet NDJSON. |
| `python -m pytest -q backend/tests` với `PYTHONPATH=backend/src` | 7/7, dùng Python 3.12.5 và Qdrant local mode trên đĩa. |
| `node demo/walkthrough.mjs` | Qua trên Chrome 157.0.8103.51 headless. Dừng worker thật, mở lại trang popup của extension và nhấp nguồn tạo tab Chrome mới. |

Workload có 2 trang, 6 đoạn được giữ và 2 batch. Proxy ghi 3 request upload, gồm một lần mất phản hồi và một lần gửi lại nguyên batch. Qdrant có 6 point và 0 bản ghi logic trùng. Hai thẻ hiện giờ quan sát khác nhau, khớp với payload đã gửi. Độ trễ từ quan sát đến mốc `indexed_at` là 5.010–5.028 giây, median 5.019 giây trên 6 đoạn. Nếu tính đến khi proxy nhận xác nhận ghi lần đầu từ backend, khoảng là 5.048–5.058 giây, median 5.053 giây. [Dữ liệu JSON của lượt chạy](walkthrough-result.json)

Build của bản gốc `daf8495` qua trên Windows. Baseline có `npm test` placeholder trả mã lỗi. Backend gốc dùng Qdrant binary Apple Silicon và yêu cầu khóa OpenAI khi import, nên luồng gốc chưa được chạy trên máy Windows này. Qdrant server riêng, khóa OpenAI thật và thao tác bằng toolbar Chrome có cửa sổ còn cần xác minh. Workload trên dùng Qdrant local mode, Chrome headless và provider fixture. Chưa có dữ liệu nghiên cứu người dùng hay kết quả so sánh hiệu năng với baseline.
