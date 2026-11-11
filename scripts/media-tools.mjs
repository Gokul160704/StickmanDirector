export function getMediaToolConfig() {
  return { ffmpeg: process.env.STICKMAN_FFMPEG ?? process.env.FFMPEG ?? 'ffmpeg', ffprobe: process.env.STICKMAN_FFPROBE ?? process.env.FFPROBE ?? 'ffprobe' };
}
