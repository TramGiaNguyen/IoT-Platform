import 'package:flutter/material.dart';
import 'package:flutter_mjpeg/flutter_mjpeg.dart';

class CameraPreviewWidget extends StatelessWidget {
  final String? streamUrl;
  final String cameraName;
  final int? occupancy;
  final VoidCallback? onTap;
  final bool isMjpegStream;

  const CameraPreviewWidget({
    Key? key,
    this.streamUrl,
    required this.cameraName,
    this.occupancy,
    this.onTap,
    this.isMjpegStream = true,
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
              // Stream layer
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

              // Bottom overlay: occupancy badge
              if (occupancy != null && occupancy! >= 0)
                Positioned(
                  bottom: 10,
                  right: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: occupancy! > 0
                          ? const Color(0xFFA855F7)
                          : const Color(0xFF40484C),
                      borderRadius: BorderRadius.circular(9999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.person,
                          color: Colors.white,
                          size: 14,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '$occupancy',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            fontFamily: 'Manrope',
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
