export const getGoogleDriveFileId = (url: string) => {
  const match = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/)
  return match ? match[1] : null
}

// A pasted Google Drive "share" link (…/file/d/FILE_ID/view) is an HTML
// viewer page, not raw image bytes, so it can't be used as an <img> src
// directly. Drive's own "thumbnail" endpoint is the most reliable way to
// hotlink a Drive image (the older uc?export=view redirect frequently fails
// for anything but tiny files) — but it still only works if the file's
// sharing is actually set to "Anyone with the link can view".
export const toDirectImageUrl = (url: string) => {
  const fileId = getGoogleDriveFileId(url)
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : url
}

// Video URLs can point anywhere, so there's no single embeddable player that
// works for all of them — but the realistic sources (YouTube, Vimeo, Google
// Drive, a direct .mp4) all support one, so resolve those inline instead of
// just linking out. Only a truly unrecognized link (a random webpage, a
// social post, etc.) falls back to opening in a new tab, since there is
// nothing to embed for that.
export const getVideoEmbed = (url: string) => {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
  if (youtube) {
    return { provider: 'youtube' as const, thumbnail: `https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`, embedUrl: `https://www.youtube.com/embed/${youtube[1]}?autoplay=1` }
  }
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) {
    return { provider: 'vimeo' as const, thumbnail: null, embedUrl: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` }
  }
  const driveFileId = getGoogleDriveFileId(url)
  if (driveFileId) {
    return { provider: 'drive' as const, thumbnail: null, embedUrl: `https://drive.google.com/file/d/${driveFileId}/preview` }
  }
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return { provider: 'file' as const, thumbnail: null, embedUrl: url }
  }
  return null
}
