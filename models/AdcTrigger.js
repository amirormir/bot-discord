import mongoose from "mongoose";

const adcTriggerSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  triggers: {
    type: [String],
    required: true,
    default: ["adc", "ADC", "AD", "ad", "AD carry", "Ad carry"],
  },
  responses: {
    type: [String],
    required: true,
    default: [
      "ENCORE LA FAUTE DES ADC",
      "C'est jamais de la faute de la toplane GOAT",
      "tu veux que je te trouve la moyenne des morts de tout les adc du discord goat?",
      "oui oui , les adc oui",
    ],
  },
});

export const AdcTrigger = mongoose.model("AdcTrigger", adcTriggerSchema);
