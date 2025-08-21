import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';

function ImagePickerModal({ onClose, onSelectImage }) {
  const [activeTab, setActiveTab] = useState<'upload' | 'select'>('upload');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [storedImages, setStoredImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // Upload file to Supabase storage bucket "images"
  const handleUpload = async () => {
    if (!uploadFile) return;
    setLoading(true);
    // Create a unique filename using timestamp
    const fileName = `${Date.now()}-${uploadFile.name}`;
    // Assuming RLS requires authenticated user ID for uploads
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("User not authenticated. Cannot upload image.");
        setLoading(false);
        return;
    }
    // Modify path if your RLS expects user ID, e.g., `${user.id}/${fileName}`
    // Check your RLS policy for the exact path structure needed.
    const filePath = fileName; // Adjust if needed based on RLS (e.g., `${user.id}/${fileName}`)

    const { error } = await supabase.storage.from('images').upload(filePath, uploadFile);
    if (error) {
      // Log the specific error for debugging RLS issues
      console.error("Upload error:", error);
      alert("Upload error: " + error.message + ". Check console and RLS policies.");
      setLoading(false);
      return;
    }
    // Use the same filePath used for upload to get the public URL
    const { data: urlData, error: urlError } = supabase.storage.from('images').getPublicUrl(filePath);

    if (urlError) {
      console.error("Error getting public URL:", urlError);
      alert("Error getting public URL: " + urlError.message);
      setLoading(false);
      return;
    }
    console.log("Generated Public URL:", urlData.publicUrl); // Log the URL
    onSelectImage(urlData.publicUrl, width, height);
    setLoading(false);
    onClose();
  };

  // Load stored images from Supabase storage bucket "images"
  const loadStoredImages = async () => {
    setLoading(true);
    // Adjust the path if your images are stored in a subfolder or require user ID based on RLS
    // Example: If images are in user-specific folders:
    // const { data: { user } } = await supabase.auth.getUser();
    // const listPath = user ? `${user.id}/` : ''; // List files in user's folder or root if no user/public
    const listPath = ''; // List files from the root, adjust if needed

    const { data, error } = await supabase.storage.from('images').list(listPath, { limit: 100 }); // Increase limit if needed

    if (error) {
      console.error("Error listing images:", error);
      alert("Error listing images: " + error.message + ". Check RLS policies for SELECT.");
      setLoading(false);
      return;
    }
    console.log("Raw image list data:", data); // Log raw data

    if (!data) {
        console.log("No image data found in storage bucket.");
        setStoredImages([]);
        setLoading(false);
        return;
    }

    // Map each item to its public URL
    const urls = data.map((item) => {
        // Ensure the path used here matches the path used for listing/uploading if relevant
        const imagePath = listPath ? `${listPath}${item.name}` : item.name;
        const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(imagePath);
        console.log(`Public URL for ${item.name}:`, publicUrlData?.publicUrl); // Log each URL
        return publicUrlData?.publicUrl;
      });

    setStoredImages(urls.filter(url => !!url)); // Filter out any nullish values.
    setLoading(false);
  };

  // When switching to "select" tab, load stored images
  useEffect(() => {
    if (activeTab === 'select') {
      loadStoredImages();
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-4 flex flex-col"> {/* Added flex flex-col */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Select an Image</h3>
          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex gap-4 mb-4">
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('upload')}>
            Upload
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('select')}>
            Select
          </Button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium">Width (e.g., 300px or 100%)</label>
          <input
            type="text"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium">Height (e.g., 200px)</label>
          <input
            type="text"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {/* Content Area */}
        <div className="flex-grow overflow-hidden"> {/* Added flex-grow and overflow-hidden */}
          {activeTab === 'upload' ? (
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadFile(e.target.files[0]);
                  }
                }}
              />
              <div className="mt-4 flex justify-end">
                <Button variant="primary" onClick={handleUpload} loading={loading}>
                  Upload Image
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full"> {/* Ensure this div takes height */}
              {loading ? (
                <p>Loading images...</p>
              ) : (
                // Added overflow-y-auto and max-h-80 (adjust as needed)
                <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-80 border p-2 flex-grow">
                  {storedImages.length > 0 ? (
                    storedImages.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`Stored image ${index + 1}`} // More descriptive alt text
                        className={`cursor-pointer border ${selectedImage === url ? 'border-blue-500 border-2' : 'border-gray-200'} object-contain h-24 w-full`} // Added object-contain and fixed height
                        onClick={() => setSelectedImage(url)}
                        onError={(e) => { // Add error handler for debugging
                          console.error(`Error loading image: ${url}`, e);
                          // Optionally replace src with a placeholder on error
                          // e.currentTarget.src = 'path/to/placeholder.png';
                        }}
                      />
                    ))
                  ) : (
                    <p className="col-span-3 text-center text-gray-500">No images found in storage.</p> // Improved message
                  )}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2 flex-shrink-0"> {/* Added flex-shrink-0 */}
                <Button variant="secondary" onClick={() => setActiveTab('upload')}>
                  Back to Upload
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (selectedImage) {
                      onSelectImage(selectedImage, width, height);
                      onClose();
                    }
                  }}
                  disabled={!selectedImage}
                >
                  Select Image
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { ImagePickerModal };
