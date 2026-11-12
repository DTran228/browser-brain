# Kiến trúc và phần đóng góp

## B0–B4

| Milestone | Công việc |
| --- | --- |
| B0 | Khởi động trên Windows, Qdrant local mode, kiểm tra cấu hình và kết nối, hai trang tổng hợp, dữ liệu fixture riêng. |
| B1 | Quan sát các khối văn bản đang hiển thị, giữ URL đầy đủ và UUID tài liệu từ Chrome, lưu thời điểm quan sát trên từng đoạn. |
| B2 | Hàng đợi bền vững, xác nhận lưu, phục hồi bằng alarm, upload tuần tự và ghi lặp lại an toàn. |
| B3 | Popup Chrome, luồng tìm kiếm gửi thẻ nguồn trước, trạng thái kết nối và lỗi, bật/tạm dừng/xóa lịch sử theo profile. |
| B4 | Kiểm tra TypeScript, FastAPI và Qdrant, walkthrough Chrome, workload tổng hợp và biểu mẫu nghiên cứu. |

TypeScript/React, Vite, việc dùng LRU, kiến trúc extension → FastAPI → Qdrant, chat JSONL và tích hợp OpenAI có sẵn từ dự án của ElliottF05. Phần triển khai lần này đổi phạm vi dedup, thêm phục hồi sau lỗi và xác nhận ghi, gắn đúng nguồn và thời gian quan sát, cùng các chức năng giao diện và kiểm thử trong bảng. [Repo gốc](https://github.com/ElliottF05/browser-brain)

## Capture, batching và LRU

Content script lấy văn bản từ các khối như đoạn, tiêu đề và mục danh sách đang giao với viewport. Nó ưu tiên khối con khi các khối lồng nhau, bỏ qua vùng nhập liệu và chỉ chạy ở tài liệu chính. Nó quan sát cuộn, thay đổi DOM và URL. `pushState` và `replaceState` được phát hiện qua kiểm tra URL mỗi giây. Navigation tải tài liệu mới có UUID mới do Chrome cấp. Mỗi lần thu thập mang theo URL tại lúc đọc, gồm query và fragment. Hai URL vẫn là hai nguồn nếu văn bản trùng.

Batching gom các đoạn nhỏ của cùng tài liệu và URL vào một request. Mỗi đoạn tối đa 4 KiB UTF‑8. Batch tối đa 24 KiB JSON UTF‑8 và 24 đoạn. Khi đủ khoảng 8 KiB, đủ 24 đoạn hoặc chờ 5 giây, batch đủ điều kiện gửi. Đồng hồ 5 giây là mục tiêu trong worker đang hoạt động. Alarm định kỳ 30 giây đánh thức worker sau khi nó bị dừng. Chrome có thể trì hoãn alarm khi ngủ hoặc chịu tải. [Vòng đời extension service worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle/)

LRU giữ các mục được dùng gần đây và loại mục ít được dùng gần đây nhất khi hết chỗ. Khóa của worker là UUID tài liệu, URL đầy đủ và chuỗi đã chuẩn hóa Unicode NFC và khoảng trắng. Cache worker giới hạn 2.000 mục và 1 MiB khóa, còn cache content script giới hạn 512 mục. Dedup theo chuỗi chính xác giúp gộp các lần DOM gửi lại cùng văn bản. Một thay đổi câu chữ tạo mục mới. Một lần tải lại tài liệu có UUID mới và được ghi như lần xem mới. Cùng tài liệu, URL và đoạn văn giữ lần quan sát sớm nhất. Mỗi thẻ nguồn hiển thị thời điểm của đoạn được truy xuất. Khi một URL có nhiều lượt xem, thẻ đại diện cho đoạn có điểm khớp cao nhất trong tập ứng viên.

## Hàng đợi và xử lý request lặp lại

`chrome.storage.local` giữ tối đa 256 batch hoặc 2 MiB trạng thái JSON. Một chuỗi Promise đảm bảo các thao tác đọc–sửa–ghi chạy lần lượt. Capture nhận xác nhận sau khi Chrome đã lưu. Worker có một vòng gửi. ID được tạo khi tạo batch, còn nội dung được chốt trước lần gửi đầu tiên. Upload timeout, 408, 429 và 5xx được thử lại với thời gian chờ tăng từ 5 giây đến 5 phút, hoặc lâu hơn nếu `Retry-After` yêu cầu. Lỗi kết thúc có nút **Retry** và **Delete batch**. Khi hết chỗ, popup và badge báo lỗi. Trang còn mở giữ một nhóm chưa được xác nhận để thử lại. Nếu trang đã đóng trước khi Chrome lưu nhóm đó, nhóm đó có thể mất.

Mỗi đoạn tạo một ID Qdrant ổn định từ phiên bản chia đoạn/model, tài liệu, URL và văn bản. Backend đọc các ID trước khi gọi provider, chỉ tạo embedding cho các đoạn chưa tồn tại và dùng `wait=True` khi ghi. Một retry sau mất phản hồi tìm lại các ID đã ghi. Nếu lần trước ghi được một phần, retry chỉ ghi phần thiếu. Khi phát hiện observation sớm hơn, backend cập nhật `captured_at` và giữ `indexed_at` của lần ghi đầu. LRU có thể mất khi worker tắt, còn Qdrant vẫn kiểm tra đúng các ID. Khóa trong một tiến trình giữ chuỗi đọc–ghi và xóa nhất quán. Mỗi profile dùng một backend và một collection.

Xóa lịch sử ghi ý định vào Chrome trước khi gọi backend. Backend giữ mốc xóa trên đĩa và hoàn tất thao tác đang dở khi khởi động lại. Upload đến muộn với thời điểm quan sát trước hoặc bằng mốc xóa bị bỏ qua. Trạng thái đang xóa giữ capture tắt cho đến khi backend xác nhận. Nếu mất kết nối, mở lại popup và chọn **Finish clearing**.

## Tìm kiếm và dữ liệu cũ

FastAPI trả luồng NDJSON, mỗi dòng là một sự kiện JSON. Popup ghép lại các byte trước khi parse từng dòng vì một packet có thể kết thúc giữa dòng hoặc giữa ký tự Unicode. Sự kiện nguồn đến trước phần trả lời. Các mã như `[S1]` liên kết tới URL thực trong các thẻ nguồn. Popup chỉ mở HTTP(S) hợp lệ và hiển thị đoạn trích dưới dạng văn bản. Ngưỡng cosine 0,22 và tối đa 8 URL là mặc định thực nghiệm cho quy mô này. Chất lượng tìm theo nghĩa cần kiểm tra với provider thật.

Collection mới mặc định là `browser_brain_v1`. Bản ghi cũ có `timestamp` được hiển thị với nhãn **Indexed** và **View time unavailable**. Để sao chép có chủ đích các vector cũ, dừng backend đích, cấu hình profile OpenAI và destination khác `chunks`, rồi chạy từ `backend`:

```powershell
uv run --locked python src/migrate_legacy.py --source-url http://127.0.0.1:6333
```

Lệnh đọc collection `chunks` từ Qdrant server cũ, kiểm tra 1536 chiều/cosine, giữ payload và sao chép bằng ID ổn định. Dữ liệu cũ không có giờ quan sát để khôi phục. Fixture mode dùng thư mục con `fixture` và collection hậu tố `_fixture`.
