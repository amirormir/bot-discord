import mongoose from "mongoose";

const watchedUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
});

export const WatchedUser = mongoose.model("WatchedUser", watchedUserSchema);
