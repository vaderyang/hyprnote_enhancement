CREDENTIALS_FILE="$HOME/pinote-r2.toml"
ENDPOINT_URL="https://3db5267cdeb5f79263ede3ec58090fe0.r2.cloudflarestorage.com"
BUCKET_FROM="pinote-cache"
BUCKET_TO="pinote-cache2"

AWS_REGION=auto s5cmd \
    --log trace \
    --credentials-file "$CREDENTIALS_FILE" \
    --endpoint-url "$ENDPOINT_URL" \
    cp "s3://$BUCKET_FROM/*" "s3://$BUCKET_TO/"
