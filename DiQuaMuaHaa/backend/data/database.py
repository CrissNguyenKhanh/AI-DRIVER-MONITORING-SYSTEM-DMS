import mysql.connector
from mysql.connector import Error
import hashlib
import json
from datetime import datetime


class Database:
    def __init__(self):
        self.host = "localhost"
        self.port = 3306
        self.user = "root"
        self.password = ""  # XAMPP mặc định không có password
        self.database = "medical_ai_db"

        # Tạo database nếu chưa có
        self.create_database()
        self.init_tables()

    def get_connection(self):
        """Kết nối đến MySQL"""
        try:
            connection = mysql.connector.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                database=self.database,
            )
            return connection
        except Error as e:
            print(f"❌ Lỗi kết nối MySQL: {e}")
            return None

    def create_database(self):
        """Tạo database nếu chưa tồn tại"""
        try:
            connection = mysql.connector.connect(
                host=self.host, port=self.port, user=self.user, password=self.password
            )
            cursor = connection.cursor()
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS {self.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            print(f"✅ Database '{self.database}' đã sẵn sàng")
            cursor.close()
            connection.close()
        except Error as e:
            print(f"❌ Lỗi tạo database: {e}")

    def init_tables(self):
        """Khởi tạo các bảng"""
        connection = self.get_connection()
        if not connection:
            return

        cursor = connection.cursor()

        # Bảng users
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                email VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        )

        # Bảng medical_records
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS medical_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                symptoms TEXT NOT NULL,
                age INT,
                gender VARCHAR(10),
                diagnosis VARCHAR(100),
                severity VARCHAR(20),
                confidence DECIMAL(5,2),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        )

        # Bảng training_data
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS training_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                symptoms TEXT NOT NULL,
                age INT,
                gender VARCHAR(10),
                diagnosis VARCHAR(100) NOT NULL,
                severity VARCHAR(20),
                is_verified BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        )

        connection.commit()

        # Tạo dữ liệu mặc định
        self.create_default_admin()
        self.create_sample_training_data()

        cursor.close()
        connection.close()
        print("✅ Các bảng đã được khởi tạo")

    def create_default_admin(self):
        """Tạo admin mặc định"""
        connection = self.get_connection()
        if not connection:
            return

        cursor = connection.cursor()
        try:
            hashed_pw = hashlib.sha256("admin123".encode()).hexdigest()
            cursor.execute(
                """
                INSERT INTO users (username, password, full_name, email, role)
                VALUES (%s, %s, %s, %s, %s)
            """,
                ("admin", hashed_pw, "Administrator", "admin@medical.ai", "admin"),
            )
            connection.commit()
            print("✅ Tạo admin thành công (username: admin, password: admin123)")
        except Error:
            pass  # Admin đã tồn tại

        cursor.close()
        connection.close()

    def create_sample_training_data(self):
        """Tạo 10 bộ dữ liệu training mẫu"""
        connection = self.get_connection()
        if not connection:
            return

        cursor = connection.cursor()

        # Kiểm tra đã có dữ liệu chưa
        cursor.execute("SELECT COUNT(*) FROM training_data")
        count = cursor.fetchone()[0]

        if count > 0:
            cursor.close()
            connection.close()
            return

        sample_data = [
            {
                "symptoms": ["Sốt cao", "Đau đầu", "Mệt mỏi"],
                "age": 25,
                "gender": "Nam",
                "diagnosis": "Cảm cúm",
                "severity": "Nhẹ",
            },
            {
                "symptoms": ["Ho khan", "Khó thở", "Đau ngực"],
                "age": 45,
                "gender": "Nữ",
                "diagnosis": "Viêm phổi",
                "severity": "Nặng",
            },
            {
                "symptoms": ["Đau bụng", "Buồn nôn", "Tiêu chảy"],
                "age": 30,
                "gender": "Nam",
                "diagnosis": "Viêm dạ dày",
                "severity": "Trung bình",
            },
            {
                "symptoms": ["Chóng mặt", "Đau đầu", "Huyết áp cao"],
                "age": 55,
                "gender": "Nam",
                "diagnosis": "Tăng huyết áp",
                "severity": "Nặng",
            },
            {
                "symptoms": ["Đau họng", "Sốt nhẹ", "Ho có đờm"],
                "age": 28,
                "gender": "Nữ",
                "diagnosis": "Viêm họng",
                "severity": "Nhẹ",
            },
            {
                "symptoms": ["Đau khớp", "Sưng khớp", "Khó cử động"],
                "age": 60,
                "gender": "Nữ",
                "diagnosis": "Viêm khớp",
                "severity": "Trung bình",
            },
            {
                "symptoms": ["Đau ngực", "Khó thở", "Đánh trống ngực"],
                "age": 50,
                "gender": "Nam",
                "diagnosis": "Bệnh tim",
                "severity": "Nặng",
            },
            {
                "symptoms": ["Mẩn ngứa", "Đỏ da", "Sưng"],
                "age": 22,
                "gender": "Nữ",
                "diagnosis": "Dị ứng",
                "severity": "Nhẹ",
            },
            {
                "symptoms": ["Đái nhiều", "Khát nước", "Mệt mỏi"],
                "age": 48,
                "gender": "Nam",
                "diagnosis": "Tiểu đường",
                "severity": "Trung bình",
            },
            {
                "symptoms": ["Đau lưng", "Tê chân", "Khó đi lại"],
                "age": 42,
                "gender": "Nữ",
                "diagnosis": "Thoát vị đĩa đệm",
                "severity": "Trung bình",
            },
        ]

        for data in sample_data:
            cursor.execute(
                """
                INSERT INTO training_data (symptoms, age, gender, diagnosis, severity, is_verified)
                VALUES (%s, %s, %s, %s, %s, %s)
            """,
                (
                    json.dumps(data["symptoms"], ensure_ascii=False),
                    data["age"],
                    data["gender"],
                    data["diagnosis"],
                    data["severity"],
                    1,
                ),
            )

        connection.commit()
        cursor.close()
        connection.close()
        print("✅ Đã tạo 10 bộ dữ liệu training mẫu")

    # ========== USER MANAGEMENT ==========
    def authenticate_user(self, username, password):
        """Xác thực user"""
        connection = self.get_connection()
        if not connection:
            return {"success": False, "error": "Không thể kết nối database"}

        cursor = connection.cursor()
        hashed_pw = hashlib.sha256(password.encode()).hexdigest()

        cursor.execute(
            """
            SELECT id, username, full_name, email, role 
            FROM users WHERE username = %s AND password = %s
        """,
            (username, hashed_pw),
        )

        user = cursor.fetchone()
        cursor.close()
        connection.close()

        if user:
            return {
                "success": True,
                "user": {
                    "id": user[0],
                    "username": user[1],
                    "full_name": user[2],
                    "email": user[3],
                    "role": user[4],
                },
            }
        return {"success": False, "error": "Sai tên đăng nhập hoặc mật khẩu"}

    def create_user(self, username, password, full_name, email, role="user"):
        """Tạo user mới"""
        connection = self.get_connection()
        if not connection:
            return {"success": False, "error": "Không thể kết nối database"}

        cursor = connection.cursor()
        try:
            hashed_pw = hashlib.sha256(password.encode()).hexdigest()
            cursor.execute(
                """
                INSERT INTO users (username, password, full_name, email, role)
                VALUES (%s, %s, %s, %s, %s)
            """,
                (username, hashed_pw, full_name, email, role),
            )
            connection.commit()
            user_id = cursor.lastrowid
            cursor.close()
            connection.close()
            return {"success": True, "user_id": user_id}
        except Error as e:
            cursor.close()
            connection.close()
            return {"success": False, "error": "Username đã tồn tại"}

    # ========== MEDICAL RECORDS ==========
    def add_medical_record(
        self, user_id, symptoms, age, gender, diagnosis, severity, confidence, notes=""
    ):
        """Thêm lịch sử khám bệnh"""
        connection = self.get_connection()
        if not connection:
            return None

        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO medical_records 
            (user_id, symptoms, age, gender, diagnosis, severity, confidence, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
            (
                user_id,
                json.dumps(symptoms, ensure_ascii=False),
                age,
                gender,
                diagnosis,
                severity,
                confidence,
                notes,
            ),
        )
        connection.commit()
        record_id = cursor.lastrowid
        cursor.close()
        connection.close()
        return record_id

    def get_user_medical_records(self, user_id):
        """Lấy lịch sử khám bệnh của user"""
        connection = self.get_connection()
        if not connection:
            return []

        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT id, symptoms, age, gender, diagnosis, severity, 
                   confidence, notes, created_at
            FROM medical_records WHERE user_id = %s ORDER BY created_at DESC
        """,
            (user_id,),
        )

        records = []
        for row in cursor.fetchall():
            records.append(
                {
                    "id": row[0],
                    "symptoms": json.loads(row[1]),
                    "age": row[2],
                    "gender": row[3],
                    "diagnosis": row[4],
                    "severity": row[5],
                    "confidence": float(row[6]) if row[6] else 0,
                    "notes": row[7],
                    "created_at": str(row[8]),
                }
            )

        cursor.close()
        connection.close()
        return records

    # ========== TRAINING DATA ==========
    def get_all_training_data(self):
        """Lấy tất cả dữ liệu training"""
        connection = self.get_connection()
        if not connection:
            return []

        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT symptoms, age, gender, diagnosis, severity
            FROM training_data WHERE is_verified = 1
        """
        )

        data = []
        for row in cursor.fetchall():
            data.append(
                {
                    "symptoms": json.loads(row[0]),
                    "age": row[1],
                    "gender": row[2],
                    "diagnosis": row[3],
                    "severity": row[4],
                }
            )

        cursor.close()
        connection.close()
        return data

    def add_training_data(self, symptoms, age, gender, diagnosis, severity):
        """Thêm dữ liệu training"""
        connection = self.get_connection()
        if not connection:
            return None

        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO training_data (symptoms, age, gender, diagnosis, severity)
            VALUES (%s, %s, %s, %s, %s)
        """,
            (
                json.dumps(symptoms, ensure_ascii=False),
                age,
                gender,
                diagnosis,
                severity,
            ),
        )
        connection.commit()
        data_id = cursor.lastrowid
        cursor.close()
        connection.close()
        return data_id


def get_all_medical_records(self):
    """Lấy tất cả medical records từ database để thống kê"""
    connection = self.get_connection()
    if not connection:
        return []

    cursor = connection.cursor()
    try:
        cursor.execute(
            """
                SELECT id, user_id, symptoms, age, gender, diagnosis, 
                       severity, confidence, notes, created_at
                FROM medical_records
                ORDER BY created_at DESC
            """
        )

        records = []
        for row in cursor.fetchall():
            records.append(
                {
                    "id": row[0],
                    "user_id": row[1],
                    "symptoms": row[2],  # Giữ nguyên string JSON
                    "age": row[3],
                    "gender": row[4],
                    "diagnosis": row[5],
                    "severity": row[6],
                    "confidence": float(row[7]) if row[7] else 0,
                    "notes": row[8],
                    "created_at": str(row[9]),
                }
            )

        cursor.close()
        connection.close()
        return records

    except Exception as e:
        print(f"❌ Error getting all medical records: {e}")
        cursor.close()
        connection.close()
        return []