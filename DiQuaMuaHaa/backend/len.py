from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import numpy as np
from sklearn.naive_bayes import MultinomialNB
from sklearn.feature_extraction.text import CountVectorizer
import pickle
import os
import joblib
from PIL import Image
import numpy as np


# Xóa các dòng import tensorflow/keras đi nhé

# --- CÁC THƯ VIỆN MỚI CHO LOGI
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from sqlalchemy import text  # Dùng để sửa bảng database tự động

# ----------------------------------


app = Flask(__name__)
CORS(app)

# MySQL Database configuration for XAMPP
app.config["SQLALCHEMY_DATABASE_URI"] = (
    "mysql+pymysql://root:@localhost:3306/medical_diagnosis"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ECHO"] = True

# --- CẤU HÌNH JWT (TOKEN) ---
app.config["JWT_SECRET_KEY"] = "chuoi-bi-mat-nay-nen-rat-dai-va-ngau-nhien"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)  # Token sống 7 ngày
jwt = JWTManager(app)
# ----------------------------

db = SQLAlchemy(app)


# --- CẤU HÌNH AI CHAT (GEMINI) ---
# Bạn hãy lấy Key miễn phí tại: https://aistudio.google.com/app/apikey
# --- CẤU HÌNH AI CHAT (GEMINI) ---


print("Danh sách model bạn được dùng:")


# Thử fallback: Nếu 1.5 flash lỗi thì dùng gemini-pro




# =======================================================
# MODELS (CẬP NHẬT USER ĐỂ CÓ PASS VÀ ROLE)
# =======================================================


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True)
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # --- CÁC CỘT MỚI (Nullable=True để không lỗi data cũ) ---
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(20), default="user")  # 'admin' hoặc 'user'

    # Relationship
    records = db.relationship("MedicalRecord", backref="user", lazy=True)

    # --- HÀM XỬ LÝ MẬT KHẨU ---
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        # Nếu tài khoản cũ chưa có pass thì luôn False
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f"<User {self.name}>"


class Disease(db.Model):
    __tablename__ = "diseases"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    severity = db.Column(db.String(20), nullable=False)
    symptoms = db.Column(db.Text, nullable=False)
    recommendations = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Disease {self.name}>"


class MedicalRecord(db.Model):
    __tablename__ = "medical_records"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    symptoms = db.Column(db.Text, nullable=False)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(10), nullable=False)
    diagnosis = db.Column(db.String(100), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    severity = db.Column(db.String(20), nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<MedicalRecord {self.id} - {self.diagnosis}>"

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "symptoms": self.symptoms,
            "age": self.age,
            "gender": self.gender,
            "diagnosis": self.diagnosis,
            "confidence": self.confidence,
            "severity": self.severity,
            "notes": self.notes,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        }


# Global variables for ML model
vectorizer = None
model = None
disease_data = None


def init_database():
    """Initialize database and Auto-Migrate for Login"""
    with app.app_context():
        try:
            # 1. Tạo bảng (nếu chưa có)
            db.create_all()
            print("✓ Database tables checked")

            # 2. TỰ ĐỘNG CẬP NHẬT BẢNG USERS CŨ (QUAN TRỌNG)
            # Kiểm tra xem có cột password_hash chưa, nếu chưa thì thêm vào bằng lệnh SQL
            try:
                inspector = db.inspect(db.engine)
                columns = [c["name"] for c in inspector.get_columns("users")]

                with db.engine.connect() as conn:
                    if "password_hash" not in columns:
                        print("⚡ Đang cập nhật Database cũ: Thêm cột password...")
                        conn.execute(
                            text(
                                "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"
                            )
                        )
                        conn.execute(
                            text(
                                "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"
                            )
                        )
                        conn.commit()
                        print("✓ Đã cập nhật bảng Users thành công")
            except Exception as e:
                print(f"⚠️ Không cần cập nhật bảng hoặc lỗi nhẹ: {e}")

            # 3. Tạo Admin mặc định (nếu chưa có)
            if User.query.filter_by(email="admin@example.com").count() == 0:
                admin = User(
                    name="Admin System",
                    email="admin@example.com",
                    phone="0999999999",
                    role="admin",
                )
                admin.set_password("admin123")  # Pass mặc định
                db.session.add(admin)
                db.session.commit()
                print("✓ Created default ADMIN user (admin@example.com / admin123)")

            # 4. Tạo User mặc định (giữ logic cũ)
            if User.query.count() <= 1:  # Chỉ có admin hoặc chưa có ai
                default_user = User(
                    name="Người dùng mặc định",
                    email="user@example.com",
                    phone="0123456789",
                    role="user",
                )
                default_user.set_password("user123")
                db.session.add(default_user)
                db.session.commit()
                print("✓ Created default NORMAL user")

            # 5. Khởi tạo dữ liệu bệnh (Giữ nguyên logic cũ)
            existing_count = Disease.query.count()
            if existing_count == 0:
                # Sample disease data
                diseases = [
                    {
                        "name": "Cảm cúm",
                        "severity": "Nhẹ",
                        "symptoms": "sốt, ho, đau đầu, mệt mỏi, đau họng, chảy nước mũi, hắt hơi",
                        "recommendations": "Nghỉ ngơi đầy đủ, Uống nhiều nước, Dùng thuốc hạ sốt nếu cần, Tránh tiếp xúc với người khác",
                    },
                    {
                        "name": "Viêm phổi",
                        "severity": "Nặng",
                        "symptoms": "sốt cao, ho có đờm, khó thở, đau ngực, mệt mỏi, ra mồ hôi, ớn lạnh",
                        "recommendations": "Đến bệnh viện ngay lập tức, Cần dùng kháng sinh, Chụp X-quang phổi, Nằm viện điều trị",
                    },
                    {
                        "name": "Viêm họng",
                        "severity": "Nhẹ",
                        "symptoms": "đau họng, khó nuốt, sưng hạch, sốt nhẹ, ho khan, khàn giọng",
                        "recommendations": "Súc họng nước muối, Uống nước ấm, Nghỉ ngơi, Dùng thuốc kháng viêm",
                    },
                    {
                        "name": "Viêm dạ dày",
                        "severity": "Trung bình",
                        "symptoms": "đau bụng, buồn nôn, nôn mửa, chướng bụng, khó tiêu, ợ hơi, ợ chua",
                        "recommendations": "Ăn nhẹ nhàng, Tránh đồ cay nóng, Uống thuốc kháng acid, Khám bác sĩ nếu kéo dài",
                    },
                    {
                        "name": "Tiểu đường",
                        "severity": "Nặng",
                        "symptoms": "khát nước, tiểu nhiều, mệt mỏi, sụt cân, nhìn mờ, vết thương lâu lành",
                        "recommendations": "Kiểm tra đường huyết ngay, Gặp bác sĩ nội tiết, Điều chỉnh chế độ ăn, Theo dõi đường huyết thường xuyên",
                    },
                    {
                        "name": "Cao huyết áp",
                        "severity": "Nặng",
                        "symptoms": "đau đầu, chóng mặt, hồi hộp, mệt mỏi, khó thở, đau ngực",
                        "recommendations": "Đo huyết áp thường xuyên, Gặp bác sĩ tim mạch, Giảm muối trong ăn uống, Tập thể dục đều đặn",
                    },
                    {
                        "name": "Viêm xoang",
                        "severity": "Trung bình",
                        "symptoms": "đau đầu, nghẹt mũi, đau vùng mặt, chảy mũi, ho, mất khứu giác",
                        "recommendations": "Xông hơi nước muối, Dùng thuốc giảm nghẹt mũi, Uống nhiều nước, Nghỉ ngơi",
                    },
                    {
                        "name": "Đau dạ dày",
                        "severity": "Trung bình",
                        "symptoms": "đau thượng vị, đói bụng đau, buồn nôn, ợ hơi, đầy bụng",
                        "recommendations": "Ăn đúng giờ, Tránh đồ cay nóng, Uống thuốc kháng acid, Khám nếu đau kéo dài",
                    },
                    {
                        "name": "Viêm gan",
                        "severity": "Nặng",
                        "symptoms": "vàng da, vàng mắt, mệt mỏi, đau bụng phải, sốt, buồn nôn, nước tiểu sẫm màu",
                        "recommendations": "Đến bệnh viện ngay, Xét nghiệm gan, Nghỉ ngơi tuyệt đối, Kiêng rượu bia",
                    },
                    {
                        "name": "Dị ứng",
                        "severity": "Nhẹ",
                        "symptoms": "ngứa, phát ban, hắt hơi, chảy nước mũi, ngứa mắt, sưng",
                        "recommendations": "Tránh chất gây dị ứng, Dùng thuốc kháng histamin, Giữ vệ sinh sạch sẽ, Gặp bác sĩ nếu nặng",
                    },
                    
                    {
                        "name": "Sốt xuất huyết",
                        "severity": "Nặng",
                        "symptoms": "sốt cao, đau đầu, đau cơ, đau khớp, buồn nôn, chảy máu cam, ban xuất huyết",
                        "recommendations": "Nhập viện ngay lập tức, Xét nghiệm máu, Truyền dịch, Theo dõi huyết sắc tố",
                    },
                    {
                        "name": "Viêm phế quản",
                        "severity": "Trung bình",
                        "symptoms": "ho có đờm, khó thở, tức ngực, thở khò khè, mệt mỏi",
                        "recommendations": "Nghỉ ngơi, Uống nhiều nước, Dùng thuốc long đờm, Tránh khói bụi",
                    },
                    {
                        "name": "Thiếu máu",
                        "severity": "Trung bình",
                        "symptoms": "mệt mỏi, chóng mặt, da nhợt nhạt, hồi hộp, khó thở khi gắng sức",
                        "recommendations": "Bổ sung sắt, Ăn thực phẩm giàu dinh dưỡng, Xét nghiệm máu, Gặp bác sĩ",
                    },
                    {
                        "name": "Rối loạn tiêu hóa",
                        "severity": "Nhẹ",
                        "symptoms": "đầy bụng, khó tiêu, ợ hơi, tiêu chảy, táo bón",
                        "recommendations": "Ăn uống điều độ, Tránh đồ khó tiêu, Uống nhiều nước, Vận động nhẹ nhàng",
                    },
                    {
                        "name": "Viêm khớp",
                        "severity": "Trung bình",
                        "symptoms": "đau khớp, sưng khớp, cứng khớp, khó cử động, đau nhiều vào sáng sớm",
                        "recommendations": "Nghỉ ngơi khớp, Chườm ấm, Vận động nhẹ nhàng, Dùng thuốc giảm đau kháng viêm",
                    },
                ]

                for disease_data_item in diseases:
                    disease = Disease(
                        name=disease_data_item["name"],
                        severity=disease_data_item["severity"],
                        symptoms=disease_data_item["symptoms"],
                        recommendations=disease_data_item["recommendations"],
                    )
                    db.session.add(disease)

                db.session.commit()
                print(f"✓ Added {len(diseases)} diseases to database")

        except Exception as e:
            print(f"✗ Error initializing database: {e}")
            db.session.rollback()


def train_model():
    """Train Naive Bayes model"""
    global vectorizer, model, disease_data

    try:
        with app.app_context():
            diseases = Disease.query.all()

            if len(diseases) == 0:
                print("✗ No diseases in database!")
                return False

            X_train = []
            y_train = []
            disease_data = {}

            for disease in diseases:
                symptoms_text = disease.symptoms.lower()
                X_train.append(symptoms_text)
                y_train.append(disease.name)

                disease_data[disease.name] = {
                    "severity": disease.severity,
                    "recommendations": disease.recommendations.split(", "),
                }

            vectorizer = CountVectorizer(token_pattern=r"\b\w+\b")
            X_vectorized = vectorizer.fit_transform(X_train)

            model = MultinomialNB(alpha=1.0)
            model.fit(X_vectorized, y_train)

            with open("model.pkl", "wb") as f:
                pickle.dump(model, f)
            with open("vectorizer.pkl", "wb") as f:
                pickle.dump(vectorizer, f)
            with open("disease_data.pkl", "wb") as f:
                pickle.dump(disease_data, f)

            print(f"✓ Model trained successfully with {len(diseases)} diseases")
            return True

    except Exception as e:
        print(f"✗ Error training model: {e}")
        return False


def load_model():
    """Load trained model"""
    global vectorizer, model, disease_data

    try:
        if os.path.exists("model.pkl") and os.path.exists("vectorizer.pkl"):
            with open("model.pkl", "rb") as f:
                model = pickle.load(f)
            with open("vectorizer.pkl", "rb") as f:
                vectorizer = pickle.load(f)
            with open("disease_data.pkl", "rb") as f:
                disease_data = pickle.load(f)
            print("✓ Model loaded from files")
            return True
    except Exception as e:
        print(f"✗ Error loading model: {e}")

    return False


def predict_disease(symptoms):
    """Helper function to predict disease"""
    if model is None or vectorizer is None:
        return None

    symptoms_text = " ".join([s.lower() for s in symptoms])
    X_input = vectorizer.transform([symptoms_text])

    prediction = model.predict(X_input)[0]
    probabilities = model.predict_proba(X_input)[0]
    confidence = float(max(probabilities))

    disease_info = disease_data.get(prediction, {})
    severity = disease_info.get("severity", "Trung bình")
    recommendations = disease_info.get("recommendations", ["Gặp bác sĩ để được tư vấn"])

    return {
        "diagnosis": prediction,
        "confidence": confidence,
        "severity": severity,
        "recommendations": recommendations,
    }


# =======================================================
# AUTH API ROUTES (MỚI THÊM)
# =======================================================


@app.route("/api/auth/register", methods=["POST"])
def register():
    """Đăng ký tài khoản mới"""
    try:
        data = request.json
        name = data.get("name")
        email = data.get("email")
        password = data.get("password")
        phone = data.get("phone")

        if not email or not password:
            return (
                jsonify({"success": False, "error": "Thiếu email hoặc mật khẩu"}),
                400,
            )

        if User.query.filter_by(email=email).first():
            return jsonify({"success": False, "error": "Email đã tồn tại"}), 400

        new_user = User(name=name, email=email, phone=phone, role="user")
        new_user.set_password(password)

        db.session.add(new_user)
        db.session.commit()

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Đăng ký thành công",
                    "user_id": new_user.id,
                }
            ),
            201,
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Đăng nhập lấy Token (Cho cả Admin và User)"""
    try:
        data = request.json
        email = data.get("email")
        password = data.get("password")

        user = User.query.filter_by(email=email).first()

        # Kiểm tra user và pass
        if not user or not user.check_password(password):
            return (
                jsonify({"success": False, "error": "Email hoặc mật khẩu không đúng"}),
                401,
            )

        # Tạo Token
        access_token = create_access_token(
            identity={
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "name": user.name,
            }
        )

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Đăng nhập thành công",
                    "access_token": access_token,
                    "user": {
                        "id": user.id,
                        "name": user.name,
                        "email": user.email,
                        "role": user.role,
                    },
                }
            ),
            200,
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def get_current_user_info():
    """Lấy thông tin người dùng từ Token"""
    current_user = get_jwt_identity()
    return jsonify({"success": True, "user": current_user})


# =======================================================
# EXISTING API ROUTES (GIỮ NGUYÊN ĐỂ KHÔNG LỖI APP CŨ)
# =======================================================


@app.route("/", methods=["GET"])
def home():
    return jsonify(
        {
            "message": "Medical Diagnosis API",
            "version": "1.1 (Auth Enabled)",
            "endpoints": {
              
                "predict": "/api/ai/predict [POST]",
             
            },
        }
    )


@app.route("/api/records", methods=["POST"])
def create_record():
    """Create medical record - GIỮ NGUYÊN LOGIC CŨ"""
    try:
        data = request.json
        user_id = data.get("user_id", 1)
        symptoms = data.get("symptoms", [])
        age = data.get("age", 0)
        gender = data.get("gender", "Nam")
        notes = data.get("notes", "")

        # Validate
        if not symptoms or len(symptoms) == 0:
            return (
                jsonify({"success": False, "error": "Vui lòng nhập triệu chứng"}),
                400,
            )

        if not age or age <= 0:
            return (
                jsonify({"success": False, "error": "Vui lòng nhập tuổi hợp lệ"}),
                400,
            )

        # Check user exists
        user = User.query.get(user_id)
        if not user:
            return jsonify({"success": False, "error": "Người dùng không tồn tại"}), 404

        # Predict disease
        prediction_result = predict_disease(symptoms)

        if not prediction_result:
            return jsonify({"success": False, "error": "Model chưa được train"}), 500

        # Create medical record
        record = MedicalRecord(
            user_id=user_id,
            symptoms=", ".join(symptoms),
            age=age,
            gender=gender,
            diagnosis=prediction_result["diagnosis"],
            confidence=prediction_result["confidence"],
            severity=prediction_result["severity"],
            notes=notes,
        )

        db.session.add(record)
        db.session.commit()

        # Return result with prediction
        return (
            jsonify(
                {
                    "success": True,
                    "message": "Đã lưu kết quả vào hồ sơ bệnh án",
                    "record_id": record.id,
                    "prediction": {
                        "success": True,
                        "diagnosis": prediction_result["diagnosis"],
                        "confidence": prediction_result["confidence"],
                        "severity": prediction_result["severity"],
                        "recommendations": prediction_result["recommendations"],
                        "input_symptoms": symptoms,
                    },
                }
            ),
            201,
        )

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/records", methods=["GET"])
def get_records():
    """Get medical records - GIỮ NGUYÊN"""
    try:
        user_id = request.args.get("user_id", type=int)

        if user_id:
            records = (
                MedicalRecord.query.filter_by(user_id=user_id)
                .order_by(MedicalRecord.created_at.desc())
                .all()
            )
        else:
            records = (
                MedicalRecord.query.order_by(MedicalRecord.created_at.desc())
                .limit(50)
                .all()
            )

        return jsonify(
            {"success": True, "records": [record.to_dict() for record in records]}
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/records/<int:record_id>", methods=["GET"])
def get_record(record_id):
    """Get single medical record - GIỮ NGUYÊN"""
    try:
        record = MedicalRecord.query.get(record_id)

        if not record:
            return jsonify({"success": False, "error": "Không tìm thấy hồ sơ"}), 404

        return jsonify({"success": True, "record": record.to_dict()})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/ai/predict", methods=["POST"])
def predict_only():
    """Predict disease without saving - GIỮ NGUYÊN"""
    try:
        data = request.json
        symptoms = data.get("symptoms", [])

        if not symptoms or len(symptoms) == 0:
            return (
                jsonify({"success": False, "error": "Vui lòng nhập triệu chứng"}),
                400,
            )

        prediction_result = predict_disease(symptoms)

        if not prediction_result:
            return jsonify({"success": False, "error": "Model chưa được train"}), 500

        return jsonify(
            {"success": True, **prediction_result, "input_symptoms": symptoms}
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/ai/symptoms", methods=["GET"])
def get_symptoms():
    """Get all available symptoms - GIỮ NGUYÊN"""
    try:
        diseases = Disease.query.all()
        all_symptoms = set()

        for disease in diseases:
            symptoms = disease.symptoms.split(", ")
            all_symptoms.update([s.strip() for s in symptoms])

        return jsonify({"success": True, "symptoms": sorted(list(all_symptoms))})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/statistics", methods=["GET"])
def get_statistics():
    """Get comprehensive diagnosis statistics"""
    try:
        # 1. Tổng bệnh nhân
        total_patients = MedicalRecord.query.count()

        # 2. Phân bố chẩn đoán (Diagnosis Distribution)
        diagnosis_stats = (
            db.session.query(
                MedicalRecord.diagnosis, db.func.count(MedicalRecord.id).label("count")
            )
            .group_by(MedicalRecord.diagnosis)
            .all()
        )

        diagnosis_data = [
            {"name": stat[0], "value": stat[1]} for stat in diagnosis_stats
        ]

        # 3. Xu hướng theo thời gian (Trends - 7 ngày gần nhất)
        trends = (
            db.session.query(
                db.func.date(MedicalRecord.created_at).label("date"),
                db.func.count(MedicalRecord.id).label("count"),
            )
            .group_by(db.func.date(MedicalRecord.created_at))
            .order_by(db.func.date(MedicalRecord.created_at).desc())
            .limit(7)
            .all()
        )

        trends_data = [
            {"date": str(trend[0]), "count": trend[1]}
            for trend in reversed(list(trends))  # Đảo ngược để hiển thị từ cũ đến mới
        ]

        # 4. Thống kê triệu chứng phổ biến (NEW)
        all_records = MedicalRecord.query.all()
        symptom_count = {}

        for record in all_records:
            symptoms = record.symptoms.split(", ")
            for symptom in symptoms:
                symptom = symptom.strip().lower()
                if symptom:
                    symptom_count[symptom] = symptom_count.get(symptom, 0) + 1

        # Lấy top 8 triệu chứng
        symptom_stats = [
            {"name": symptom.capitalize(), "value": count}
            for symptom, count in sorted(
                symptom_count.items(), key=lambda x: x[1], reverse=True
            )[:8]
        ]

        # 5. Thống kê độ tuổi (NEW)
        age_ranges = {"0-18": 0, "19-30": 0, "31-45": 0, "46-60": 0, "60+": 0}

        for record in all_records:
            age = record.age
            if age <= 18:
                age_ranges["0-18"] += 1
            elif age <= 30:
                age_ranges["19-30"] += 1
            elif age <= 45:
                age_ranges["31-45"] += 1
            elif age <= 60:
                age_ranges["46-60"] += 1
            else:
                age_ranges["60+"] += 1

        age_stats = [
            {"name": range_name, "value": count}
            for range_name, count in age_ranges.items()
        ]

        # 6. Thống kê giới tính (NEW)
        gender_stats = (
            db.session.query(
                MedicalRecord.gender, db.func.count(MedicalRecord.id).label("count")
            )
            .group_by(MedicalRecord.gender)
            .all()
        )

        gender_data = [{"name": stat[0], "value": stat[1]} for stat in gender_stats]

        # 7. Mức độ nghiêm trọng (NEW)
        severity_stats = (
            db.session.query(
                MedicalRecord.severity, db.func.count(MedicalRecord.id).label("count")
            )
            .group_by(MedicalRecord.severity)
            .all()
        )

        severity_data = [{"name": stat[0], "value": stat[1]} for stat in severity_stats]

        # Trả về tất cả dữ liệu
        return jsonify(
            {
                "success": True,
                "totalPatients": total_patients,
                "diagnosisStats": diagnosis_data,
                "trends": trends_data,
                "symptomStats": symptom_stats,  # MỚI
                "ageStats": age_stats,  # MỚI
                "genderStats": gender_data,  # MỚI
                "severityStats": severity_data,  # MỚI
            }
        )

    except Exception as e:
        print(f"Error in statistics: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users", methods=["GET"])
def get_users():
    """Get all users - GIỮ NGUYÊN"""
    try:
        users = User.query.all()
        return jsonify(
            {
                "success": True,
                "users": [
                    {
                        "id": u.id,
                        "name": u.name,
                        "email": u.email,
                        "phone": u.phone,
                        "role": u.role,  # Thêm hiển thị role
                        "created_at": u.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    for u in users
                ],
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users", methods=["POST"])
def create_user():
    """Create new user - GIỮ NGUYÊN API CŨ (Tạo user không pass)"""
    # Nếu muốn tạo user có pass, dùng /api/auth/register
    try:
        data = request.json
        name = data.get("name")
        email = data.get("email")
        phone = data.get("phone")

        if not name:
            return jsonify({"success": False, "error": "Vui lòng nhập tên"}), 400

        user = User(name=name, email=email, phone=phone, role="user")
        db.session.add(user)
        db.session.commit()

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Tạo người dùng thành công",
                    "user_id": user.id,
                }
            ),
            201,
        )

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500




@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check - GIỮ NGUYÊN"""
    try:
        db.session.execute(db.text("SELECT 1"))
        db_status = True
    except:
        db_status = False

    return jsonify(
        {
            "status": "healthy" if db_status else "unhealthy",
            "model_loaded": model is not None,
            "database_connected": db_status,
        }
    )


# --- LOAD MODEL HÌNH ẢNH (SCIKIT-LEARN) ---
image_model = None
image_classes = []

try:
    if os.path.exists("simple_image_model.pkl"):
        image_model = joblib.load("simple_image_model.pkl")
        image_classes = joblib.load("class_names.pkl")
        print("✓ Đã load model hình ảnh (Scikit-learn)")
    else:
        print("⚠️ Chưa có file model.pkl. Chế độ ảnh sẽ dùng Random giả lập.")
except Exception as e:
    print(f"Lỗi load model: {e}")

# =======================================================
# 1. API CHATBOT (GEMINI) - BẮT BUỘC PHẢI CÓ
# =======================================================


@app.route("/api/ai/predict-image", methods=["POST"])
def predict_image():
    try:
        if "image" not in request.files:
            return jsonify({"success": False, "error": "Không tìm thấy file"}), 400

        file = request.files["image"]

        # --- NẾU CÓ MODEL THẬT (SCIKIT-LEARN) ---
        if image_model:
            # 1. Xử lý ảnh giống hệt lúc Train (Resize 64x64, Đen trắng, Flatten)
            img = Image.open(file).convert("L")
            img = img.resize((64, 64))
            img_array = np.array(img).flatten()

            # Reshape để báo cho model biết đây là 1 mẫu dữ liệu
            input_data = [img_array]

            # 2. Dự đoán
            prediction_idx = image_model.predict(input_data)[0]
            # Lấy độ tin cậy (Probability)
            probabilities = image_model.predict_proba(input_data)[0]
            confidence = float(max(probabilities))

            diagnosis_name = image_classes[prediction_idx]

            # Logic lời khuyên
            severity = "Trung bình"
            recommendations = ["Theo dõi thêm"]

            # Giả sử tên thư mục bạn đặt là 'Normal', 'Pneumonia', 'Covid'
            if "Normal" in diagnosis_name or "BinhThuong" in diagnosis_name:
                severity = "Nhẹ"
                recommendations = ["Sức khỏe bình thường", "Duy trì thói quen tốt"]
            elif "Pneumonia" in diagnosis_name or "ViemPhoi" in diagnosis_name:
                severity = "Nặng"
                recommendations = [
                    "Cần chụp X-quang lại",
                    "Thăm khám bác sĩ hô hấp",
                    "Dùng thuốc theo chỉ định",
                ]

            result = {
                "diagnosis": diagnosis_name,
                "severity": severity,
                "confidence": confidence,
                "recommendations": recommendations,
            }

        # --- NẾU KHÔNG CÓ MODEL (Dùng Random giả lập) ---
        else:
            # ... (Giữ nguyên code Random cũ ở đây) ...
            mock_diseases = [
                {
                    "diagnosis": "Giả lập: Viêm phổi",
                    "severity": "Nặng",
                    "recommendations": ["Đi khám gấp"],
                },
                {
                    "diagnosis": "Giả lập: Bình thường",
                    "severity": "Nhẹ",
                    "recommendations": ["Tốt"],
                },
            ]
            import random

            temp = random.choice(mock_diseases)
            result = {
                "diagnosis": temp["diagnosis"],
                "severity": temp["severity"],
                "confidence": 0.85,
                "recommendations": temp["recommendations"],
            }

        # Lưu Database (Giữ nguyên code cũ)
        user_id = 1
        record = MedicalRecord(
            user_id=user_id,
            symptoms=f"[Hình ảnh] {file.filename}",
            age=30,
            gender="Ẩn",
            diagnosis=result["diagnosis"],
            confidence=result["confidence"],
            severity=result["severity"],
            notes="AI Image Scan (Scikit-learn)",
        )
        db.session.add(record)
        db.session.commit()

        return jsonify({"success": True, "prediction": result, "record_id": record.id})

    except Exception as e:
        print(f"Lỗi: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("=" * 60)
    print("🏥 MEDICAL DIAGNOSIS API - KHỞI ĐỘNG")
    print("=" * 60)

    print("\n📦 Đang khởi tạo database và cập nhật Schema...")
    init_database()

    print("\n🤖 Đang tải model...")
    if not load_model():
        print("⚠️  Không tìm thấy model, đang train model mới...")
        train_model()

    print("\n" + "=" * 60)
    print("✓ Server sẵn sàng tại: http://localhost:5000")
    print("✓ Login Admin: admin@example.com | Pass: admin123")
    print("✓ API Login: POST /api/auth/login")
    print("=" * 60 + "\n")

    app.run(debug=True, host="0.0.0.0", port=5000)
