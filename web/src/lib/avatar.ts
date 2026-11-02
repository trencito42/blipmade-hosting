/**
 * Shrinks a photo to a small square picture in the browser and returns it as a data address, which is how the site keeps
 * the pictures of the staff and of the bots: it does not load images from other places and keeps no files for them.
 * The picture is cut to the centre and written as JPEG, so it stays far below the limit of the server (60,000 characters).
 */
export async function pictureFromFile(file: File, size = 96): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot shrink the picture.');
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= 40_000) return url;
  }
  throw new Error('The picture is too detailed. Try another one.');
}
