import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// L'URL contient le mot de passe de la base : elle ne s'affiche jamais dans les journaux.
const MONGO_URL = process.env.MONGO_URL;

export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connexion à MongoDB réussie");
  } catch (error) {
    console.error("Erreur de connexion à MongoDB :", error.message);
    process.exit(1);
  }
}
