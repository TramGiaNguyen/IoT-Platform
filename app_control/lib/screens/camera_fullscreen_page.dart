import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../widgets/camera_preview_widget.dart';

/// Trang xem camera toàn màn hình.
///
/// Khi mở sẽ ép thiết bị xoay ngang (landscape) để hiển thị đúng tỉ lệ
/// của camera IP (thường là 16:9). User có thể bấm rotate để chuyển qua
/// lại giữa portrait/landscape nếu camera dọc. Khi thoát trang sẽ trả
/// lại orientation mà app đang dùng ở phần còn lại.
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

class _CameraFullscreenPageState extends State<CameraFullscreenPage> {
  bool _isLandscape = true;

  @override
  void initState() {
    super.initState();
    // Cho phép xoay cả 2 chiều + landscapeLeft/landscapeRight để có trải
    // nghiệm xem camera tốt nhất. Khi user xoay ngược lại thì thiết bị
    // sẽ tự xử lý (đảo ảnh theo orientation sensor).
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.immersiveSticky,
      overlays: [],
    );
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
      DeviceOrientation.portraitUp,
    ]);
  }

  @override
  void dispose() {
    // Trả lại orientation mặc định của app (portrait) khi đóng trang
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.edgeToEdge,
    );
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.portraitUp,
    ]);
    super.dispose();
  }

  void _toggleOrientation() {
    setState(() {
      _isLandscape = !_isLandscape;
    });
    SystemChrome.setPreferredOrientations(
      _isLandscape
          ? const [
              DeviceOrientation.landscapeLeft,
              DeviceOrientation.landscapeRight,
            ]
          : const [DeviceOrientation.portraitUp],
    );
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.streamUrl ?? widget.fallbackStreamUrl;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Video: fill toàn bộ, cover để giữ tỉ lệ
            Positioned.fill(
              child: CameraPreviewWidget(
                cameraName: widget.cameraName,
                streamUrl: url,
              ),
            ),

            // Top-left close
            Positioned(
              top: 8,
              left: 8,
              child: _CircleButton(
                icon: Icons.close,
                tooltip: 'Dong',
                onTap: () => Navigator.of(context).pop(),
              ),
            ),

            // Top-right rotate
            Positioned(
              top: 8,
              right: 8,
              child: _CircleButton(
                icon: _isLandscape
                    ? Icons.screen_lock_portrait
                    : Icons.screen_lock_landscape,
                tooltip: _isLandscape ? 'Xoay doc' : 'Xoay ngang',
                onTap: _toggleOrientation,
              ),
            ),

            // Bottom camera name
            Positioned(
              left: 16,
              right: 16,
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
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _CircleButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withOpacity(0.55),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Tooltip(
          message: tooltip,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Icon(icon, color: Colors.white, size: 22),
          ),
        ),
      ),
    );
  }
}
