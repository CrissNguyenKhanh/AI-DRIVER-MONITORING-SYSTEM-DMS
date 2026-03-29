# test_cam.py
import cv2
cap = cv2.VideoCapture(0)
while True:
    ret, frame = cap.read()
    if ret:
        cv2.imshow("test", frame)
    if cv2.waitKey(1) == 27:
        break
cap.release()
cv2.destroyAllWindows()