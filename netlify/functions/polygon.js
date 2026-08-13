export async function handler(event, context) {
  const apiKey = process.env.POLYGON_API_KEY;
  const url = event.queryStringParameters.url;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: "Missing POLYGON_API_KEY"
    };
  }

  if (!url) {
    return {
      statusCode: 400,
      body: "Missing ?url= parameter"
    };
  }

  const fullUrl = `${url}&apiKey=${apiKey}`;

  try {
    const response = await fetch(fullUrl);
    const data = await response.text();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: data
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: "Proxy error: " + err.toString()
    };
  }
}
