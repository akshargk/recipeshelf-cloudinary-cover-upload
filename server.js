import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { Readable } from "node:stream";

import upload from "./config/upload.js";
import cloudinary from "./config/cloudinary.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const recipes = [
  {
    id: "r1",
    title: "Roasted Tomato Pasta",
    coverUrl: null,
    coverPublicId: null,
  },
  {
    id: "r2",
    title: "Lemon Rice Bowl",
    coverUrl: null,
    coverPublicId: null,
  },
];

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "RecipeShelf" });
});

app.get("/api/recipes", (req, res) => {
  res.json({ recipes });
});

app.get("/api/recipes/:recipeId", (req, res) => {
  const recipe = recipes.find((item) => item.id === req.params.recipeId);

  if (!recipe) {
    return res.status(404).json({
      message: "Recipe not found",
    });
  }

  return res.json({ recipe });
});

// Upload image buffer to Cloudinary
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "recipeshelf/covers",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));
        resolve(result);
      },
    );

    Readable.from(buffer).pipe(stream);
  });
}

// Check recipe BEFORE processing the upload
function findRecipe(req, res, next) {
  const recipe = recipes.find((item) => item.id === req.params.recipeId);

  if (!recipe) {
    return res.status(404).json({
      message: "Recipe not found",
    });
  }

  req.recipe = recipe;
  next();
}

// Upload recipe cover
app.post(
  "/api/recipes/:recipeId/cover",
  findRecipe,
  upload.single("cover"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Cover image is required",
      });
    }

    const recipe = req.recipe;
    const oldPublicId = recipe.coverPublicId;

    let uploaded;

    try {
      uploaded = await uploadToCloudinary(req.file.buffer);
    } catch (error) {
      console.error("Cloudinary upload failed:", error.message);

      return res.status(502).json({
        message: "Image storage service unavailable",
      });
    }

    // Save new cover before deleting old cover
    recipe.coverUrl = uploaded.secure_url;
    recipe.coverPublicId = uploaded.public_id;

    if (oldPublicId && oldPublicId !== uploaded.public_id) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (error) {
        console.error("Old cover cleanup failed:", error.message);
      }
    }

    return res.status(201).json({
      recipeId: recipe.id,
      coverUrl: recipe.coverUrl,
    });
  },
);

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "Cover image is too large",
      });
    }

    return res.status(400).json({
      message: "Invalid file upload",
    });
  }

  if (error.message === "Only JPG and PNG images are allowed") {
    return res.status(400).json({
      message: error.message,
    });
  }

  console.error(error);

  return res.status(500).json({
    message: "Unexpected server error",
  });
});

app.listen(port, () => {
  console.log(`RecipeShelf API running on http://localhost:${port}`);
});
