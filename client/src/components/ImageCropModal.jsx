import { useEffect, useRef, useState } from 'react';

const OUTPUT_SIZE = 420;

const ImageCropModal = ({ file, title = 'Adjust picture', onCancel, onSave }) => {
  const imageRef = useRef(null);
  const [source, setSource] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      return undefined;
    }

    if (!file.type.startsWith('image/')) {
      setError('Select an image file.');
      return undefined;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSource(reader.result);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setError('');
    };
    reader.onerror = () => setError('Could not read that image.');
    reader.readAsDataURL(file);

    return () => {
      reader.abort();
    };
  }, [file]);

  const handleSave = () => {
    const image = imageRef.current;

    if (!image) {
      setError('Image is still loading.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    context.fillStyle = '#eef2ea';
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const baseScale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (OUTPUT_SIZE - width) / 2 + Number(offsetX);
    const y = (OUTPUT_SIZE - height) / 2 + Number(offsetY);

    context.drawImage(image, x, y, width, height);
    onSave(canvas.toDataURL('image/jpeg', 0.86));
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card image-crop-modal" aria-labelledby="image-crop-heading">
        <div>
          <p className="eyebrow">Profile picture</p>
          <h2 id="image-crop-heading">{title}</h2>
        </div>

        {error ? <p className="alert">{error}</p> : null}

        <div className="crop-frame">
          {source ? (
            <img
              ref={imageRef}
              src={source}
              alt="Profile preview"
              style={{
                transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
              }}
            />
          ) : (
            <span>Loading image...</span>
          )}
        </div>

        <label>
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>

        <label>
          Horizontal position
          <input
            type="range"
            min="-120"
            max="120"
            step="1"
            value={offsetX}
            onChange={(event) => setOffsetX(Number(event.target.value))}
          />
        </label>

        <label>
          Vertical position
          <input
            type="range"
            min="-120"
            max="120"
            step="1"
            value={offsetY}
            onChange={(event) => setOffsetY(Number(event.target.value))}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={handleSave} disabled={!source}>
            Save picture
          </button>
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
};

export default ImageCropModal;

