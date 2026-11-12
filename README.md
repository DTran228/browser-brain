<div align="center">

<h1>🧠 Browser Brain</h1>
<h3>Nhớ nội dung? Tìm lại đúng trang ngay trong Chrome.</h3>

<p>Hỏi bằng lời của bạn, xem đoạn trích và giờ đã đọc, rồi mở lại nguồn gốc.</p>

<p>
  <a href="web-extension/public/manifest.json"><img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&amp;logo=googlechrome&amp;logoColor=white" alt="Chrome Manifest V3"></a>
  <a href="web-extension/package.json"><img src="https://img.shields.io/badge/TypeScript-React-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript và React"></a>
  <a href="docs/architecture.md"><img src="https://img.shields.io/badge/FastAPI-Qdrant-009688?style=flat-square&amp;logo=fastapi&amp;logoColor=white" alt="FastAPI và Qdrant"></a>
</p>

<p>
  <a href="#try-demo"><img src="https://img.shields.io/badge/Th%E1%BB%AD%20demo-Trang%20m%E1%BA%ABu-4285F4?style=for-the-badge&amp;logo=googlechrome&amp;logoColor=white" alt="Thử demo với trang mẫu" height="38"></a>
  &nbsp;
  <a href="#windows-setup"><img src="https://img.shields.io/badge/C%C3%A0i%20%C4%91%E1%BA%B7t-Windows-24292E?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Cài đặt trên Windows" height="38"></a>
</p>

<a href="docs/screenshots/browser-brain-cover.png"><img src="docs/screenshots/browser-brain-cover.png" width="100%" alt="Minh họa Browser Brain với hai dấu trang trên nền bến cảng và ngọn hải đăng lúc chạng vạng"></a>

</div>

---

## 💡 Vì sao dùng Browser Brain?

Bạn nhớ đã đọc một chi tiết hay nhưng quên tiêu đề, tên trang và từ khóa đã tìm. Với Browser Brain, bạn có thể hỏi về chính chi tiết đó.

- 🔎 **Tìm theo điều bạn nhớ.** Hỏi bằng một câu tự nhiên ngay trong popup Chrome.
- 🔗 **Mở lại nguồn gốc.** Mỗi thẻ có URL đầy đủ, đoạn trích và dòng **Viewed** cho biết lúc bạn xem.
- 📑 **Giữ cả hai nguồn khi nội dung trùng.** Một đoạn xuất hiện trên hai trang vẫn có thể dẫn bạn trở lại cả hai địa chỉ.
- 🔄 **Tiếp tục sau khi mất kết nối.** Nội dung đã vào hàng đợi được giữ trên máy và tự gửi lại khi kết nối phục hồi.
- 🎛️ **Chủ động chọn lúc ghi nhận.** Bạn có thể bật, tạm dừng và xóa dữ liệu ngay trong popup.

---

<a id="try-demo" name="try-demo"></a>

## 🖼️ Xem Browser Brain hoạt động

### Hai trang có cùng một đoạn văn

> **Câu hỏi demo:** What does the cobalt lantern protocol record?

<table>
  <tr>
    <th width="50%" align="center">Khi lượt gửi bị gián đoạn</th>
    <th width="50%" align="center">Sau khi gửi lại và tìm kiếm</th>
  </tr>
  <tr>
    <td align="center"><a href="docs/screenshots/browser-brain-pending.png"><img src="docs/screenshots/browser-brain-pending.png" width="100%" alt="Popup Chrome báo lỗi gửi tạm thời và còn hai mục chờ"></a></td>
    <td align="center"><a href="docs/screenshots/browser-brain-search-result.png"><img src="docs/screenshots/browser-brain-search-result.png" width="100%" alt="Browser Brain trả hai thẻ nguồn với đoạn văn giống nhau, URL và giờ xem riêng"></a></td>
  </tr>
</table>

Hai ảnh trên là ảnh chụp Chrome với dữ liệu mẫu. **Harbor field notes** và **Marsh field notes** chứa cùng một đoạn về *cobalt lantern protocol*. Sau một lỗi gửi, Browser Brain vẫn trả cả hai địa chỉ với giờ xem tương ứng.

1. Hoàn tất [cài đặt trên Windows](#windows-setup) và chọn **Thử với dữ liệu mẫu**.
2. Mở [Harbor field notes](http://127.0.0.1:8765/alpha.html?edition=lab#shared), bật **Enable capture**, rồi bấm **Open marsh notes** trong cùng tab.
3. Đợi số **pending uploads** về 0, nhập câu hỏi trên và bấm một thẻ nguồn. Đối chiếu URL và dòng **Viewed**.

Muốn thử cả tình huống ngắt kết nối? [Walkthrough từng bước](docs/demo.md)

---

## 📖 Ghi nhận khi bạn đọc

- **Enable capture** bắt đầu lưu văn bản hiển thị trên các trang HTTP(S) bạn mở, như đoạn văn, tiêu đề và mục danh sách.
- **Pause capture** dừng ghi nhận mới. Các mục đã vào hàng đợi vẫn được gửi khi chương trình trên máy kết nối lại.
- **Clear history** tạm dừng ghi nhận và xóa nội dung, chat và hàng đợi của Browser Brain. Nếu thao tác bị gián đoạn, khởi động lại chương trình rồi chọn **Finish clearing**. Chrome quản lý lịch sử duyệt web của Chrome riêng.

## 🔒 Dữ liệu được xử lý ở đâu?

| Thành phần | Cách hoạt động |
| --- | --- |
| **Chrome extension** | Ghi nhận khi bạn bật và lưu nội dung đang chờ gửi trong Chrome. |
| **FastAPI + Qdrant trên máy** | Tiếp nhận nội dung, lưu chỉ mục để tìm lại các đoạn liên quan. Lịch sử chat cũng được lưu trong thư mục dữ liệu của bạn. |
| **OpenAI** | Khi dùng chế độ OpenAI, chương trình gửi văn bản đã ghi và câu hỏi để tìm các đoạn liên quan. Để tạo câu trả lời, chương trình gửi câu hỏi, đoạn trích và thời điểm xem. |
| **Chế độ demo** | Dùng dữ liệu mẫu và tìm kiếm cục bộ. Bạn có thể thử mà không cần khóa OpenAI. |

Khóa OpenAI được cấu hình ở `backend/.env` trên máy. [Kiến trúc và cấu hình lưu trữ](docs/architecture.md)

---

<a id="windows-setup" name="windows-setup"></a>

## 🚀 Cài đặt và chạy trên Windows

Chuẩn bị **Chrome 120 trở lên**, **Node.js 24**, **Git** và **uv**. Dùng PowerShell cho các lệnh bên dưới. [Cài Node.js](https://nodejs.org/en/download) · [Cài Git](https://git-scm.com/install/windows) · [Cài uv](https://docs.astral.sh/uv/getting-started/installation/)

### Bước 1 · Tải và nạp extension

Nếu đã có thư mục dự án, mở PowerShell tại đó và bắt đầu từ `Set-Location web-extension`. Nếu GitHub yêu cầu đăng nhập khi tải, dùng tài khoản có quyền truy cập repo.

```powershell
git clone https://github.com/DTran228/browser-brain.git
Set-Location browser-brain
Set-Location web-extension
npm.cmd ci
npm.cmd run build
Set-Location ..
```

1. Trong Chrome, mở `chrome://extensions` và bật **Developer mode**.
2. Bấm **Load unpacked** và chọn thư mục `web-extension\dist` vừa tạo.
3. Ghim Browser Brain từ menu Extensions.

### Bước 2 · Chuẩn bị chương trình chạy trên máy

Từ thư mục dự án, chạy:

```powershell
Set-Location backend
uv python install 3.11
uv sync --locked
```

### Cách 1 · Thử với dữ liệu mẫu

Trong cùng cửa sổ PowerShell, chạy:

```powershell
$env:BROWSER_BRAIN_PROVIDER = 'fixture'
$env:BROWSER_BRAIN_DATA = Join-Path (Split-Path -Parent $PWD.Path) '.local\readme-demo'
uv run --locked python src/main.py
```

Giữ cửa sổ này mở. Popup sẽ hiện **Connected · fixture mode**. Mở **cửa sổ PowerShell thứ hai tại thư mục dự án** và chạy:

```powershell
.\backend\.venv\Scripts\python.exe -m http.server 8765 --bind 127.0.0.1 --directory demo
```

Quay lại [bài thử với hai trang mẫu](#try-demo). Khi dùng xong, bấm **Ctrl+C** trong hai cửa sổ để dừng.

### Cách 2 · Tìm lại các trang bạn đọc hằng ngày

Dừng demo và dùng một profile Chrome riêng cho trang cá nhân. Mở PowerShell mới ở thư mục dự án rồi chạy:

```powershell
Set-Location backend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Điền `OPENAI_API_KEY`, giữ `BROWSER_BRAIN_PROVIDER=openai` rồi lưu file. Chạy `uv run --locked python src/main.py` trong cùng cửa sổ. Khi popup hiện **Connected to local backend**, bấm **Enable capture**. Nếu trang đã mở trước khi cài extension, tải lại trang. Những lần sau, chạy lại lệnh khởi động từ thư mục `backend`.

<details>
<summary><strong>Gặp lỗi khi chạy?</strong></summary>

| Bạn thấy gì? | Thử làm gì? |
| --- | --- |
| **Backend disconnected** | Kiểm tra cửa sổ chạy chương trình. Mở [trang kiểm tra kết nối](http://127.0.0.1:8000/health) khi chương trình đang chạy. |
| **Pending uploads** chưa về 0 | Đợi vài giây để các đoạn được gom và gửi. Nếu chương trình đã dừng, chạy lại và đợi extension thử lại. |
| **No relevant indexed sources found** | Kiểm tra ghi nhận đã bật khi bạn đọc trang. Đợi các mục chờ gửi xong rồi hỏi về một chi tiết cụ thể. |
| Popup yêu cầu khóa OpenAI | Chọn chế độ demo hoặc điền khóa trong `backend/.env` và khởi động lại chương trình. |
| Chrome vẫn dùng bản build cũ | Tại `chrome://extensions`, bấm **Reload** cho Browser Brain rồi tải lại trang đang đọc. |

</details>

---

## 📚 Kiểm thử và tài liệu

Bài thử Chrome với hai trang mẫu ghi nhận **6 đoạn từ 2 nguồn**, một lần gửi lại và **0 bản ghi trùng**. Chất lượng tìm kiếm với OpenAI thật và thời gian người dùng tìm lại nguồn vẫn cần đo.

- [Walkthrough Windows và kết quả kiểm thử](docs/demo.md)
- [Kiến trúc, phần đóng góp và ghi công](docs/architecture.md)
- [Quy trình đo với người dùng](docs/evaluation.md)

<details>
<summary><strong>Lệnh kiểm tra dành cho người phát triển</strong></summary>

Chạy từ thư mục dự án:

```powershell
Set-Location web-extension
npm.cmd run typecheck
npm.cmd test
npm.cmd run build

Set-Location ..\backend
$env:PYTHONPATH = 'src'
uv run --locked python -m pytest -q

Set-Location ..
node demo/walkthrough.mjs
```

Walkthrough tự động cần Chrome, thư mục build `dist`, môi trường `backend\.venv` và các cổng 8000, 8001, 8765 đang trống.

</details>

<p align="center"><sub>Ảnh bìa là minh họa tạo bằng AI. Ảnh demo chụp từ Browser Brain đang chạy trong Chrome.</sub></p>
