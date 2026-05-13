"""Test phone detection via socket.io"""

import cv2
import base64
import socketio

# Connect to backend
sio = socketio.Client()
connected = False

@sio.event
def connect():
    global connected
    connected = True
    print("✅ Connected to server")

@sio.event
def phone_result(data):
    """Receive phone detection results"""
    boxes = data.get("boxes", [])
    error = data.get("error")
    
    if error:
        print(f"❌ Error: {error}")
    else:
        print(f"📱 Detected {len(boxes)} phone(s):")
        for i, box in enumerate(boxes):
            print(f"   [{i}] {box['label']} @ ({box['x']:.2f}, {box['y']:.2f}) "
                  f"size=({box['w']:.2f}x{box['h']:.2f}) prob={box['prob']:.2f}")

@sio.event
def disconnect():
    print("❌ Disconnected")

try:
    # Connect
    sio.connect("http://localhost:8000", 
                transports=["websocket"],
                wait_timeout=5)
    
    if not connected:
        print("⚠️  Connection timeout")
        exit(1)
    
    # Load test image (try to use webcam or test image)
    print("\n📷 Loading test image...")
    cap = cv2.VideoCapture(0)
    if cap.isOpened():
        ret, frame = cap.read()
        cap.release()
        if not ret:
            print("❌ Cannot read from webcam")
            exit(1)
    else:
        print("⚠️  No webcam found, trying to load a test image...")
        # Try to use a sample image
        frame = cv2.imread("./data/test_frame.jpg")
        if frame is None:
            print("❌ No test image found")
            exit(1)
    
    # Resize to 320x240 (like frontend)
    frame_small = cv2.resize(frame, (320, 240))
    
    # Encode as base64
    _, buffer = cv2.imencode(".jpg", frame_small, [cv2.IMWRITE_JPEG_QUALITY, 55])
    image_b64 = base64.b64encode(buffer).decode("utf-8")
    
    print(f"📊 Frame: {frame_small.shape}, base64 len: {len(image_b64)}")
    
    # Send via socket.io
    print("\n🚀 Sending phone_frame to server...")
    sio.emit("phone_frame", {"image": f"data:image/jpeg;base64,{image_b64}"})
    
    # Wait for response
    import time
    time.sleep(2)
    
    print("\n✅ Test complete")
    sio.disconnect()
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
