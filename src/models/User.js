// src/models/User.js
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

/**
 * Hash plain password before comparing.
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.verifyPassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * Static helper: hash a plain password.
 * @param {string} plain
 * @returns {Promise<string>}
 */
userSchema.statics.hashPassword = async function (plain) {
  return bcrypt.hash(plain, 12);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
