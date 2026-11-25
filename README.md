# STREAMER LIFE – REAL WORLD V1

Game mô phỏng cuộc sống streamer 3D góc nhìn thứ ba, xây dựng bằng Three.js/WebGL và TypeScript.

## Tính năng chính

- Nhân vật người 3D humanoid đã rig và có animation idle/walk.
- Phòng streamer 3D với ánh sáng ngày/đêm, bóng đổ, cửa sổ, giường, tủ, bàn gaming và thiết bị streamer GLB.
- Di chuyển WASD hoặc joystick cảm ứng bên phải; vuốt độc lập để xoay camera.
- Livestream, người xem, follower, doanh thu và nâng cấp thiết bị.
- Nhu cầu đói, năng lượng, tâm trạng, sức khỏe, độ thoải mái.
- Đặt đồ ăn, chờ giao, nhận tại cửa và ăn uống.
- Ngân hàng, lưu thủ công và tự động lưu bằng localStorage.
- Giao diện tiếng Việt tối ưu cho mobile landscape; có màn hình nhắc xoay điện thoại.

## Chạy ở local

Yêu cầu Node.js và pnpm.

```bash
pnpm install
pnpm dev
```

Mở URL Vite in trong terminal. Để build production:

```bash
pnpm build
pnpm preview
```

## Kiểm tra

```bash
pnpm typecheck
pnpm test
pnpm smoke
```

`pnpm smoke` chạy Chromium headless, kiểm tra title, di chuyển 3D, dashboard livestream, đặt/nhận/ăn đồ ăn, lưu game, pause/resume và viewport mobile ngang. Screenshot smoke được ghi vào thư mục `shots/`.

## Cấu trúc asset

- `assets/models/streamer-character-animated.glb`: model nhân vật runtime.
- `assets/models/streamer-desk-setup.glb`: bộ bàn, ghế và thiết bị streamer runtime.
- `assets/models/streamer-character-base.glb` và `streamer-character-rigged.glb`: các phiên bản nguồn của nhân vật.

## Điều khiển

- Desktop: `WASD` để di chuyển, kéo chuột để xoay camera, `E` khi ở gần điểm tương tác, `Esc` để tạm dừng.
- Mobile: màn hình ngang; joystick tròn bên phải để di chuyển, vuốt vùng game để xoay camera, nút `E` để tương tác và nút điện thoại để mở menu.
