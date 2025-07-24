import mongoose from "mongoose";

const blessedUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
});

export const BlessedUser = mongoose.model("BlessedUser", blessedUserSchema);
