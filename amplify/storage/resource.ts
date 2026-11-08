import { defineStorage } from "@aws-amplify/backend";

/**
 * S3 bucket for project/task photos.
 *
 * The app has no sign-in (data uses the public API key), so photos are
 * stored under a guest-accessible prefix.
 */
export const storage = defineStorage({
  name: "projectPhotos",
  access: (allow) => ({
    "photos/*": [allow.guest.to(["read", "write", "delete"])],
  }),
});
