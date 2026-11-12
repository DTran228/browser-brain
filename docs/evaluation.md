# Đo thời gian tìm lại nguồn

## Quy trình dành cho người tham gia

1. Tuyển người tham gia tự nguyện và đặt mã như `P01`. Chỉ ghi cohort `student_researcher` khi người đó thực sự là sinh viên đang làm nghiên cứu. Dùng profile Chrome và thư mục Browser Brain riêng cho từng người. Cho họ thử hai giao diện trên một bộ bài tập khác trước khi đo.
2. Chuẩn bị hai bộ nhiệm vụ tương đương A và B với các trang đích khác nhau. Mỗi bộ có cùng số trang đã đọc, cùng số trang gây nhiễu, mức gợi ý tương đương và một URL đích chính xác mỗi nhiệm vụ. Tạo khóa chấm có đầy đủ query và fragment nếu chúng xác định bài. Dùng hai trang trong `demo` để thử cách chấm, rồi chuẩn bị bộ tương đương độc lập trước khi tuyển. Cho người tham gia đọc bộ trang với cùng lượng thời gian, kiểm tra indexing hoàn tất, và đóng các tab nguồn trước mỗi lượt.
3. Luân phiên bốn thứ tự: `History-A → Brain-B`, `Brain-B → History-A`, `History-B → Brain-A`, `Brain-A → History-B`. Điều kiện History dùng Chrome History và điều hướng thủ công trong bộ trang. Điều kiện Brain dùng Browser Brain và mở thẻ nguồn. Mỗi người thực hiện cả hai điều kiện.
4. Bắt đầu đồng hồ ngay khi đưa ra nhiệm vụ. Dừng khi URL đúng mở trong Chrome. Chọn trước giới hạn 180 giây cho mọi nhiệm vụ. Với timeout, lưu `success=false`, `elapsed_seconds=180`, `error_code=timeout`. Với bỏ cuộc sớm hoặc lỗi kỹ thuật, lưu thời điểm dừng thực tế và mã `gave_up` hoặc `technical`. Nếu mở sai rồi tìm tiếp, đồng hồ vẫn chạy và ghi số lần mở sai trong `notes`.
5. Điền một dòng cho mỗi nhiệm vụ vào [biểu mẫu CSV trống](study-record.csv). Lưu bản thu thập riêng với mã giả và không ghi lịch sử duyệt cá nhân. Chốt quy tắc phân tích trước khi xem kết quả.

Báo cáo số người thực tế hoàn thành hai điều kiện, số lượt thử, số thành công và tỷ lệ thành công từng điều kiện. Với thời gian chính, tính median thời gian của các nhiệm vụ thành công theo từng điều kiện cho từng người. Tính median trên các median cá nhân của những người có ít nhất một lượt thành công ở cả hai điều kiện, và ghi số cặp thực tế được dùng. Median của số lượng chẵn là trung bình hai giá trị giữa. Báo riêng timeout, bỏ cuộc, lỗi kỹ thuật và số người bị loại khỏi phép tính thời gian. Có thể báo median chênh lệch theo cặp, lấy thời gian History trừ Browser Brain cho mỗi người.

Chưa thu thập dữ liệu người dùng. Workload kỹ thuật dùng trang tổng hợp và thời gian indexing. Báo cáo thời gian tìm nguồn và số student researchers sau khi có bản ghi thật.
