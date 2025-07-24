import mongoose from "mongoose";

const randomResponseUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
});

export const RandomResponseUser = mongoose.model(
  "RandomResponseUser",
  randomResponseUserSchema
);
