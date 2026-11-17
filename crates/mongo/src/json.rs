//! Strict JSON reader that keeps object key order. The workspace `serde_json`
//! sorts object keys (no `preserve_order`), and turning that feature on would
//! change map ordering in every other crate.

/// Numbers keep their source text so the caller decides Int32, Int64 or Double.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(String),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

// Deep enough for any BSON document (the server caps nesting near 100) while
// keeping recursion far from the stack limit.
const MAX_DEPTH: usize = 200;

pub fn parse(text: &str) -> Result<Json, String> {
    let mut r = Reader { src: text, pos: 0 };
    r.skip_ws();
    let value = r.value(0)?;
    r.skip_ws();
    if r.pos < r.src.len() {
        return Err(r.error("unexpected text after the value"));
    }
    Ok(value)
}

struct Reader<'a> {
    src: &'a str,
    pos: usize,
}

impl Reader<'_> {
    fn bytes(&self) -> &[u8] {
        self.src.as_bytes()
    }

    fn peek(&self) -> Option<u8> {
        self.bytes().get(self.pos).copied()
    }

    fn error(&self, msg: &str) -> String {
        let before = &self.src[..self.pos];
        let line = before.matches('\n').count() + 1;
        let column = before.rsplit('\n').next().unwrap_or("").chars().count() + 1;
        format!("{msg} at line {line}, column {column}")
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.pos += 1;
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), String> {
        if self.peek() == Some(byte) {
            self.pos += 1;
            Ok(())
        } else {
            Err(self.error(&format!("expected '{}'", byte as char)))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, String> {
        if depth > MAX_DEPTH {
            return Err(self.error("nested too deeply"));
        }
        match self.peek() {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => self.string().map(Json::String),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(b't') => self.literal("true", Json::Bool(true)),
            Some(b'f') => self.literal("false", Json::Bool(false)),
            Some(b'n') => self.literal("null", Json::Null),
            Some(_) => Err(self.error("expected a value")),
            None => Err(self.error("unexpected end of input")),
        }
    }

    fn literal(&mut self, word: &str, value: Json) -> Result<Json, String> {
        if self.src[self.pos..].starts_with(word) {
            self.pos += word.len();
            Ok(value)
        } else {
            Err(self.error("expected a value"))
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, String> {
        self.pos += 1;
        let mut entries: Vec<(String, Json)> = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Json::Object(entries));
        }
        loop {
            self.skip_ws();
            if self.peek() != Some(b'"') {
                return Err(self.error("expected a quoted key"));
            }
            let key_at = self.pos;
            let key = self.string()?;
            if entries.iter().any(|(k, _)| *k == key) {
                self.pos = key_at;
                return Err(self.error(&format!("duplicate key \"{key}\"")));
            }
            self.skip_ws();
            self.expect(b':')?;
            self.skip_ws();
            let value = self.value(depth + 1)?;
            entries.push((key, value));
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(Json::Object(entries));
                }
                _ => return Err(self.error("expected ',' or '}'")),
            }
        }
    }

    fn array(&mut self, depth: usize) -> Result<Json, String> {
        self.pos += 1;
        let mut items = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Json::Array(items));
        }
        loop {
            self.skip_ws();
            items.push(self.value(depth + 1)?);
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(Json::Array(items));
                }
                _ => return Err(self.error("expected ',' or ']'")),
            }
        }
    }

    fn string(&mut self) -> Result<String, String> {
        self.pos += 1;
        let mut out = String::new();
        let mut run = self.pos;
        loop {
            match self.peek() {
                None => return Err(self.error("unterminated string")),
                Some(b'"') => {
                    out.push_str(&self.src[run..self.pos]);
                    self.pos += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    out.push_str(&self.src[run..self.pos]);
                    self.pos += 1;
                    out.push(self.escape()?);
                    run = self.pos;
                }
                Some(c) if c < 0x20 => {
                    return Err(self.error("control character in string; escape it"))
                }
                Some(_) => self.pos += 1,
            }
        }
    }

    fn escape(&mut self) -> Result<char, String> {
        let c = self
            .peek()
            .ok_or_else(|| self.error("unterminated string"))?;
        self.pos += 1;
        Ok(match c {
            b'"' => '"',
            b'\\' => '\\',
            b'/' => '/',
            b'b' => '\u{8}',
            b'f' => '\u{c}',
            b'n' => '\n',
            b'r' => '\r',
            b't' => '\t',
            b'u' => {
                let hi = self.hex4()?;
                if (0xD800..0xDC00).contains(&hi) {
                    if !self.src[self.pos..].starts_with("\\u") {
                        return Err(self.error("unpaired surrogate escape"));
                    }
                    self.pos += 2;
                    let lo = self.hex4()?;
                    if !(0xDC00..0xE000).contains(&lo) {
                        return Err(self.error("unpaired surrogate escape"));
                    }
                    let code = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
                    char::from_u32(code).ok_or_else(|| self.error("invalid escape"))?
                } else {
                    char::from_u32(hi).ok_or_else(|| self.error("unpaired surrogate escape"))?
                }
            }
            _ => {
                self.pos -= 1;
                return Err(self.error("invalid escape"));
            }
        })
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let digits = self
            .src
            .get(self.pos..self.pos + 4)
            .filter(|d| d.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or_else(|| self.error("expected four hex digits"))?;
        self.pos += 4;
        Ok(u32::from_str_radix(digits, 16).expect("checked hex digits"))
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        match self.peek() {
            Some(b'0') => self.pos += 1,
            Some(b'1'..=b'9') => self.digits(),
            _ => return Err(self.error("expected a digit")),
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            self.required_digits()?;
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            self.required_digits()?;
        }
        if matches!(self.peek(), Some(b'0'..=b'9')) {
            return Err(self.error("leading zeros are not allowed"));
        }
        Ok(Json::Number(self.src[start..self.pos].to_string()))
    }

    fn digits(&mut self) {
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
    }

    fn required_digits(&mut self) -> Result<(), String> {
        if !matches!(self.peek(), Some(b'0'..=b'9')) {
            return Err(self.error("expected a digit"));
        }
        self.digits();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_key_order_and_number_text() {
        assert_eq!(
            parse(r#"{"b": 1.50, "a": [-0, 2E+3]}"#).unwrap(),
            Json::Object(vec![
                ("b".into(), Json::Number("1.50".into())),
                (
                    "a".into(),
                    Json::Array(vec![Json::Number("-0".into()), Json::Number("2E+3".into())])
                ),
            ])
        );
    }

    #[test]
    fn errors_name_the_position() {
        assert_eq!(
            parse("{\n  \"a\" 1\n}").unwrap_err(),
            "expected ':' at line 2, column 7"
        );
    }

    #[test]
    fn rejects_runaway_nesting() {
        assert!(parse(&"[".repeat(MAX_DEPTH + 2)).is_err());
    }
}
