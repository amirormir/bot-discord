import mongoose from "mongoose";

const bazouzouTriggerSchema = new mongoose.Schema({
  triggers: {
    type: [String],
    required: true,
    default: [
      "8=D",
      "8==D",
      "8===D",
      "8>D",
      "8=D~",
      "8=D💦",
      "8====D",
      "8=====D",
      "8======D",
      "8=====D~",
      "8====D💦",
      "8====D~",
      "8========D",
      "8=========D",
      "8===========D",
      "8============D💦",
      "8=========D~~",
      "8=========D🍑",
      "8==D~",
      "8=)D",
      "8==D🍌",
      "(8====D)",
      "[8====D]",
      "/8===D\\",
      "8==D👉👌",
      "8=D ¿",
      "8=3D",
      "8==D⛓️",
      "8===D🐍",
      "8===D🔥",
      "8===D😳",
      "8===D🚀",
      "8===D💀",
    ],
  },
  responses: {
    type: [String],
    required: true,
    default: ["force", "ptit zizi"],
  },
});

export const BazouzouTrigger = mongoose.model(
  "BazouzouTrigger",
  bazouzouTriggerSchema
);
