import 'package:flutter/material.dart';
import 'package:flutter_mjpeg/flutter_mjpeg.dart';

class CameraPreviewWidget extends StatelessWidget {
  final String? streamUrl;
  final String cameraName;
  final VoidCallback? onTap;

  const CameraPreviewWidget({
    Key? key,
    this.streamUrl,
    required this.cameraName,
    this.onTap,
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
                _buildMjpegStream()
              else
                _buildPlaceholder(),

              // Top overlay: camera name
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

  Widget _buildMjpegStream() {
    return Mjpeg(
      key: ValueKey(streamUrl),
      stream: streamUrl!,
      isLive: true,
      fit: BoxFit.cover,
      timeout: const Duration(seconds: 15),
      error: (context, error, stack) => _buildStreamError(error?.toString()),
      loading: (context) => const Center(
        child: CircularProgressIndicator(
          color: Colors.white,
          strokeWidth: 2,
        ),
      ),
    );
  }

  Widget _buildStreamError(String? error) {
    return Container(
      color: const Color(0xFF1A1A2E),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.signal_wifi_off,
                color: Color(0xFFBA1A1A),
                size: 32,
              ),
              const SizedBox(height: 8),
              const Text(
                'Khong the ket noi camera',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontFamily: 'Manrope',
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              if (error != null) ...[
                const SizedBox(height: 4),
                Text(
                  error,
                  style: const TextStyle(
                    color: Color(0xFF71787D),
                    fontSize: 10,
                    fontFamily: 'Inter',
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
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
