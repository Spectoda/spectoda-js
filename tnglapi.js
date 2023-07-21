/**
 * Represents the API response.
 * @typedef {Object} ApiResponse
 * @property {string} id - The ID of the data.
 * @property {string} name - The name of the data.
 * @property {string} tngl - The tngl value.
 * @property {string} createdAt - The creation timestamp.
 * @property {string} updatedAt - The update timestamp.
 * @property {string|null} ownerId - The owner ID.
 */

/**
 * Retrieves tngl data from the API based on the given ID.
 * @param {string} id - The ID to fetch the tngl data.
 * @returns {Promise<ApiResponse>} A promise that resolves to the tngl data.
 * @throws {Error} If the API request fails.
 */
async function fetchTnglFromApiById(id) {
  const url = `http://localhost:3000/api/tnglcode?id=${id}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Handle error case (e.g., network error, API error)
    console.error("Error:", error);
    throw error;
  }
}

/**
 * Sends tngl data to the API.
 * @param {Object} options - The options object containing the data to send to the API.
 * @param {string} options.tngl - The tngl value to send.
 * @param {string} options.name - The name value to send.
 * @param {string=} options.id - The optional ID value to send.
 * @returns {Promise<ApiResponse>} A promise that resolves to the response data.
 * @throws {Error} If the API request fails.
 */
async function sendTnglToApi({ tngl, name, id }) {
  const url = "http://localhost:3000/api/tnglcode";
  const options = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tngl, name, id }),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error("API request failed");
    }

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    // Handle error case (e.g., network error, API error)
    console.error("Error:", error);
    throw error;
  }
}

if (typeof window !== "undefined") {
  window.fetchTnglFromApiById = fetchTnglFromApiById;
  window.sendTnglToApi = sendTnglToApi;
}

export { fetchTnglFromApiById, sendTnglToApi };
