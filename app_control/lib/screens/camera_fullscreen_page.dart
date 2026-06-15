import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/camera_preview_widget.dart';

/// Trang xem camera toàn màn hình.
///
/// Khi mở sẽ ép thiết bị xoay ngang (landscape) để hiển thị đúng tỉ lệ
/// 16:9 của camera IP. Page tự giữ orientation lock suốt thời gian
/// xem và trả lại portrait khi đóng.
class CameraFullscreenPage extends StatefulWidget {
  final String cameraName;
  final String? streamUrl;
  final String? fallbackStreamUrl;

  const CameraFullscreenPage({
    Key? key,
    required this.cameraName,
    this.streamUrl,
    this.fallbackStreamUrl,
  }) : super(key: key);

  @override
  State<CameraFullscreenPage> createState() => _CameraFullscreenPageState();
}

class _CameraFullscreenPageState extends State<CameraFullscreenPage>
    with WidgetsBindingObserver {
  static const _lockLandscape = [
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ];
  static const _lockPortrait = [
    DeviceOrientation.portraitUp,
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Ẩn system UI trước cho mượt
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.immersiveSticky,
      overlays: [],
    );
    // Đợi frame đầu tiên render xong mới gọi orientation lock - tránh
    // tình trạng Android activity chưa ở trạng thái "ready to rotate"
    // dẫn đến phải bấm 2 lần mới xoay.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      SystemChrome.setPreferredOrientations(_lockLandscape);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Khi user background app, OS có thể override orientation. Khi quay
    // lại, ép lock lại landscape để tránh phải bấm rotate thêm lần nữa.
    if (state == AppLifecycleState.resumed && mounted) {
      SystemChrome.setPreferredOrientations(_lockLandscape);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setPreferredOrientations(_lockPortrait);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.streamUrl ?? widget.fallbackStreamUrl;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Video phủ toàn bộ màn hình, dùng contain để giữ tỉ lệ 16:9
          // của camera IP thay vì cắt (cover) khi fullscreen dọc.
          Positioned.fill(
            child: CameraPreviewWidget(
              cameraName: widget.cameraName,
              streamUrl: url,
              showHeader: false,
            ),
          ),

          // Nút close (góc trên-trái theo orientation hiện tại)
          Positioned(
            top: 12,
            left: 12,
            child: _CircleButton(
              icon: Icons.close,
              onTap: () => Navigator.of(context).pop(),
            ),
          ),

          // Tên camera ở giữa-dưới
          Positioned(
            left: 24,
            right: 24,
            bottom: 16,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.55),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.videocam,
                      color: Colors.white70,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        widget.cameraName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          fontFamily: 'Manrope',
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _CircleButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withOpacity(0.55),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Icon(Icons.close, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}
