import { useState, useRef, FormEvent } from "react";
import { ContentItem, ImageData } from "../models/models";
import WaveIcon from "./WaveIcon";

const HOST = import.meta.env.VITE_CHAT_HOST;

interface ChatInputProps {
  onSubmit: (content: string | ContentItem[]) => void;
  gettingResponse: boolean;
  handleFileAttachment: () => void;
  setIsListening: (isListening: boolean) => void;
  handleStopRequest: () => void;
}

const ChatInput = ({
  onSubmit,
  gettingResponse,
  handleFileAttachment,
  setIsListening,
  handleStopRequest,
}: ChatInputProps) => {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleFiles(files);
  };

  // Type guards
  const isImageData = (content: any): content is ImageData => {
    return typeof content === "object" && "kind" in content && content.kind === "image-url";
  };

  const isUploadingImage = (content: any): content is ImageData => {
    return isImageData(content) && "isUploading" in content && content.isUploading === true;
  };

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        // Create blob URL for preview
        const blobUrl = URL.createObjectURL(file);

        // Add content with blob URL and uploading state
        const uploadingImage: ContentItem = {
          content: {
            url: blobUrl,
            media_type: file.type,
            kind: "image-url",
            isUploading: true,
            serverUrl: "", // Will store the server URL after upload
          },
          type: "ImageUrl",
          part_kind: "image-url"
        };

        setContent((prev) => [...prev, uploadingImage]);

        try {
          const formData = new FormData();
          formData.append("file", file);

          const { authFetch } = await import("@/lib/utils");
          const response = await authFetch(`${HOST}/api/v1/files/upload`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} ${errorText}`);
          }

          const data = await response.json();

          // Update content with server URL but keep the blob URL for preview
          setContent((prev) =>
            prev.map((item) => {
              if (isImageData(item.content) && item.content.url === blobUrl) {
                const updatedContent: ImageData = {
                  ...item.content,
                  serverUrl: `https://open-upload.api.gabrielmalek.com/files/${data.id}`,
                  isUploading: false,
                };
                return {
                  content: updatedContent,
                  type: "ImageUrl",
                  part_kind: "image-url"
                };
              }
              return item;
            })
          );
        } catch (error) {
          console.error("Error uploading file:", error);
          // Remove the content on error
          setContent((prev) =>
            prev.filter(
              (item) => !(isImageData(item.content) && item.content.url === blobUrl)
            )
          );
          URL.revokeObjectURL(blobUrl);
        }
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // Check if any images are still uploading
    const hasUploadingImages = content.some(
      (item) => isImageData(item.content) && item.content.isUploading === true
    );

    if (hasUploadingImages) {
      console.error("Please wait for all images to finish uploading");
      return;
    }

    if (textInput.trim() || content.length > 0) {
      // For text-only messages
      if (textInput.trim() && content.length === 0) {
        onSubmit(textInput.trim());
      } else {
        // For mixed content or images only
        const newContent = [...content];
        if (textInput.trim()) {
          newContent.push({
            content: textInput.trim(),
            type: "str",
            part_kind: "text"
          });
        }

        // Filter out invalid content
        const validContent = newContent.filter((item): item is ContentItem => {
          if (isImageData(item.content) && !item.content.serverUrl) {
            console.error("Missing serverUrl for image:", item);
            return false;
          }
          return true;
        });

        if (validContent.length === 0) {
          console.error("No valid content to send");
          return;
        }

        onSubmit(validContent);
      }
      setContent([]);
      setTextInput("");
    }
  };

  const removeContent = (index: number) => {
    const item = content[index];
    if (isImageData(item.content) && item.content.isUploading) {
      URL.revokeObjectURL(item.content.url);
    }
    setContent((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div
        className={`flex-1 ${
          isDragging
            ? "border-2 border-dashed border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {content.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {content.map((item, index) => (
              <div key={index} className="relative group">
                {typeof item.content === "string" ? (
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm">
                    {item.content}
                    <button
                      type="button"
                      onClick={() => removeContent(index)}
                      className="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <img
                      src={item.content.serverUrl || item.content.url}
                      alt="Uploaded content"
                      className="h-20 w-20 object-cover rounded-lg"
                    />
                    {item.content.isUploading && (
                      <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeContent(index)}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-gray-200"
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type your message or drag and drop images..."
            autoComplete="off"
            spellCheck="false"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full p-2 text-gray-500 bg-gray-50 hover:bg-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <i className="fas fa-paperclip"></i>
            </button>
            {gettingResponse ? (
              <button
                type="button"
                className="rounded-full p-2 text-red-600 bg-gray-100 hover:bg-gray-200 dark:text-red-400 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] flex items-center justify-center"
                onClick={handleStopRequest}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              </button>
            ) : textInput.trim() === "" && content.length === 0 ? (
              <button
                type="button"
                className="rounded-full p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] flex items-center justify-center"
                onClick={() => setIsListening(true)}
              >
                <WaveIcon />
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] flex items-center justify-center"
                onClick={handleSubmit}
              >
                <i className="fas fa-paper-plane"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
};

export default ChatInput;
