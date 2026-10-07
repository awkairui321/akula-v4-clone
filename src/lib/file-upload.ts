export type UploadedFile = { name: string; file_data_url: string };
export const FILE_ACCEPT = "application/pdf,image/png,image/jpeg";
export const MAX_FILE_SIZE = 2 * 1024 * 1024;
export function validUploadedFile(file: UploadedFile) {
  return (
    typeof file?.name === "string" &&
    !!file.name.trim() &&
    typeof file.file_data_url === "string" &&
    file.file_data_url.length <= 2800000 &&
    /^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/]+={0,2}$/.test(
      file.file_data_url,
    )
  );
}
export async function readUpload(file: File): Promise<UploadedFile> {
  if (
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type) ||
    file.size > MAX_FILE_SIZE ||
    !file.size
  )
    throw new Error("Choose a PDF, PNG or JPEG file up to 2 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, file_data_url: String(reader.result) });
    reader.onerror = () => reject(new Error("Unable to read this file. Please try again."));
    reader.readAsDataURL(file);
  });
}
