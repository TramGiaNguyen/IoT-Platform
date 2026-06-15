import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// Camera preview powered by package:media_kit (libmpv/ffmpeg).
///
/// Supports RTSP, RTMP, HLS, DASH, MJPEG, and any URL ffplay can open.
/// The streamUrl is whatever the user entered in the web dashboard's
/// camera setup - usually an RTSP URL like
/// `rtsp://user:pass@192.168.x.x:554/Streaming/Channels/101` for Hikvision.
///
/// Stateless host so callers can simply pass the URL; the actual Player
/// is owned by [_MediaKitCameraView] so it is properly disposed when the
/// preview is removed from the tree (room change, fullscreen close, etc.).
class CameraPreviewWidget extends StatelessWidget {
  final String? streamUrl;
  final String cameraName;
  final VoidCallback? onTap;
  final BoxFit fit;
  final bool showHeader;

  const CameraPreviewWidget({
    Key? key,
    this.streamUrl,
    required this.cameraName,
    this.onTap,
    this.fit = BoxFit.cover,
    this.showHeader = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final hasValidStream = streamUrl != null && streamUrl!.isNotEmpty;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 220,
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0xFF003345).withOpacity(0.3),
            width: 1,
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(15),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (hasValidStream)
                _MediaKitCameraView(streamUrl: streamUrl!, fit: fit)
              else
                _buildPlaceholder(),

              if (showHeader)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withOpacity(0.7),
                          Colors.transparent,
                        ],
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.videocam,
                          color: Colors.white70,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            cameraName,
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
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlaceholder() {
    return Container(
      color: const Color(0xFF1A1A2E),
      child: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.videocam,
              color: Color(0xFF40484C),
              size: 40,
            ),
            SizedBox(height: 8),
            Text(
              'Chua co camera',
              style: TextStyle(
                color: Color(0xFF40484C),
                fontSize: 13,
                fontFamily: 'Manrope',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MediaKitCameraView extends StatefulWidget {
  final String streamUrl;
  final BoxFit fit;
  const _MediaKitCameraView({required this.streamUrl, this.fit = BoxFit.contain});

  @override
  State<_MediaKitCameraView> createState() => _MediaKitCameraViewState();
}

class _MediaKitCameraViewState extends State<_MediaKitCameraView> {
  late final Player _player;
  late final VideoController _controller;
  String? _lastOpenedUrl;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    // Open the stream after the first frame so VideoController is mounted.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _openStream();
    });
  }

  Future<void> _openStream() async {
    final url = widget.streamUrl;
    if (url.isEmpty || _lastOpenedUrl == url) return;
    _lastOpenedUrl = url;
    try {
      await _player.open(Media(url), play: true);
    } catch (e) {
      // The Video widget will keep showing the loading state - surface
      // the error to the user through the AppBar title would be nicer,
      // but for the preview we keep it simple.
      debugPrint('Camera stream open failed: $e');
    }
  }

  @override
  void didUpdateWidget(covariant _MediaKitCameraView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.streamUrl != widget.streamUrl) {
      _openStream();
    }
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // FittedBox(contain) keeps the video's native aspect ratio and
    // letterboxes the empty space with black. This is the correct
    // behaviour for IP cameras (typically 16:9) - BoxFit.cover would
    // crop the sides when the host widget is taller than 16:9.
    return ColoredBox(
      color: Colors.black,
      child: FittedBox(
        fit: widget.fit,
        child: SizedBox(
          width: 1920,
          height: 1080,
          child: Video(
            controller: _controller,
            fit: BoxFit.fill,
            controls: NoVideoControls,
          ),
        ),
      ),
    );
  }
}
