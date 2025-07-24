import mongoose from "mongoose";

const messageTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  content: {
    type: String,
    required: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const MessageTemplate = mongoose.model(
  "MessageTemplate",
  messageTemplateSchema
);
