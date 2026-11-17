//! Ordered reader for JSON plus the literal parts of mongosh syntax. The
//! workspace `serde_json` sorts object keys (no `preserve_order`), and turning
//! that feature on would change map ordering in every other crate. Nothing
//! here evaluates code: calls are kept as names and arguments for `shell` to
//! map onto the BSON helpers it knows.

/// Numbers keep their source text so the caller decides Int32, Int64 or Double.
/// `at` is a byte offset into the source, for conversion errors.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number {
        text: String,
        at: usize,
    },
    String(String),
    Array(Vec<Json>),
    Object {
        entries: Vec<(String, Json)>,
        at: usize,
    },
    /// `Name(args)`; `new Date(…)` is named `new Date`.
    Call {
        name: String,
        args: Vec<Json>,
        at: usize,
    },
    /// `/pattern/flags` with the pattern exactly as written.
    Regex {
        pattern: String,
        flags: String,
        at: usize,
    },
}

/// `at` is a byte offset into the source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonError {
    pub message: String,
    pub at: usize,
}

// Deep enough for any BSON document (the server caps nesting near 100) while
// keeping recursion far from the stack limit.
const MAX_DEPTH: usize = 200;

const REGEX_FLAGS: &str = "ilmsux";

pub fn parse(text: &str) -> Result<Json, JsonError> {
    let mut r = Reader::new(text);
    r.skip_ws();
    let value = r.value(0)?;
    r.skip_ws();
    if r.pos < r.src.len() {
        return Err(r.error("unexpected text after the value"));
    }
    Ok(value)
}

/// 1-based line and column, the column counted in Unicode scalars.
pub fn line_column(text: &str, at: usize) -> (usize, usize) {
    let before = text.get(..at).unwrap_or(text);
    let line = before.matches('\n').count() + 1;
    let column = before.rsplit('\n').next().unwrap_or("").chars().count() + 1;
    (line, column)
}

pub struct Reader<'a> {
    pub src: &'a str,
    pub pos: usize,
}

impl<'a> Reader<'a> {
    pub fn new(src: &'a str) -> Self {
        Reader { src, pos: 0 }
    }

    fn bytes(&self) -> &'a [u8] {
        self.src.as_bytes()
    }

    pub fn peek(&self) -> Option<u8> {
        self.bytes().get(self.pos).copied()
    }

    pub fn error(&self, msg: &str) -> JsonError {
        self.error_at(msg, self.pos)
    }

    pub fn error_at(&self, msg: &str, at: usize) -> JsonError {
        JsonError {
            message: msg.into(),
            at,
        }
    }

    /// Skips whitespace and `//` / `/* */` comments. An unterminated block
    /// comment runs to the end, which then reports "unexpected end of input".
    pub fn skip_ws(&mut self) {
        loop {
            while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
                self.pos += 1;
            }
            let rest = &self.src[self.pos..];
            if rest.starts_with("//") {
                self.pos += rest.find('\n').unwrap_or(rest.len());
            } else if let Some(body) = rest.strip_prefix("/*") {
                self.pos += body.find("*/").map_or(rest.len(), |i| i + 4);
            } else {
                return;
            }
        }
    }

    pub fn eat(&mut self, byte: u8) -> bool {
        if self.peek() == Some(byte) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    pub fn expect(&mut self, byte: u8) -> Result<(), JsonError> {
        if self.eat(byte) {
            Ok(())
        } else {
            Err(self.error(&format!("expected '{}'", byte as char)))
        }
    }

    /// An ASCII JavaScript identifier, or `None` without moving.
    pub fn ident(&mut self) -> Option<&'a str> {
        let start = self.pos;
        if !matches!(self.peek(), Some(b'a'..=b'z' | b'A'..=b'Z' | b'_' | b'$')) {
            return None;
        }
        while matches!(
            self.peek(),
            Some(b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'$')
        ) {
            self.pos += 1;
        }
        Some(&self.src[start..self.pos])
    }

    pub fn value(&mut self, depth: usize) -> Result<Json, JsonError> {
        if depth > MAX_DEPTH {
            return Err(self.error("nested too deeply"));
        }
        match self.peek() {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"' | b'\'') => self.string().map(Json::String),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(b'/') => self.regex(),
            Some(b'(') => Err(self.error("expressions and arrow functions are not supported")),
            Some(_) => match self.ident() {
                Some(word) => self.word(word, depth),
                None => Err(self.error("expected a value")),
            },
            None => Err(self.error("unexpected end of input")),
        }
    }

    fn word(&mut self, word: &str, depth: usize) -> Result<Json, JsonError> {
        let at = self.pos - word.len();
        match word {
            "true" => return Ok(Json::Bool(true)),
            "false" => return Ok(Json::Bool(false)),
            "null" => return Ok(Json::Null),
            "function" => {
                return Err(self.error_at("functions are not supported; use literal values", at))
            }
            "new" => {
                self.skip_ws();
                let class = self.ident().unwrap_or_default();
                self.skip_ws();
                if class != "Date" || self.peek() != Some(b'(') {
                    return Err(self.error_at("only new Date(\"…\") is supported after new", at));
                }
                let args = self.args(depth)?;
                return Ok(Json::Call {
                    name: "new Date".into(),
                    args,
                    at,
                });
            }
            _ => {}
        }
        self.skip_ws();
        if self.peek() == Some(b'(') {
            let args = self.args(depth)?;
            return Ok(Json::Call {
                name: word.into(),
                args,
                at,
            });
        }
        if self.src[self.pos..].starts_with("=>") {
            return Err(self.error_at("arrow functions are not supported", at));
        }
        Err(self.error_at(
            &format!(
                "{word} is not supported; use a literal value or a helper such as ObjectId(\"…\")"
            ),
            at,
        ))
    }

    /// `( value, … )` with an optional trailing comma; the reader must be on `(`.
    pub fn args(&mut self, depth: usize) -> Result<Vec<Json>, JsonError> {
        self.expect(b'(')?;
        let mut items = Vec::new();
        loop {
            self.skip_ws();
            if self.eat(b')') {
                return Ok(items);
            }
            items.push(self.value(depth + 1)?);
            self.skip_ws();
            if self.eat(b')') {
                return Ok(items);
            }
            if !self.eat(b',') {
                return Err(self.error("expected ',' or ')'"));
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, JsonError> {
        let at = self.pos;
        self.pos += 1;
        let mut entries: Vec<(String, Json)> = Vec::new();
        loop {
            self.skip_ws();
            if self.eat(b'}') {
                return Ok(Json::Object { entries, at });
            }
            let key_at = self.pos;
            let key = self.key()?;
            if entries.iter().any(|(k, _)| *k == key) {
                return Err(self.error_at(&format!("duplicate key \"{key}\""), key_at));
            }
            self.skip_ws();
            self.expect(b':')?;
            self.skip_ws();
            let value = self.value(depth + 1)?;
            entries.push((key, value));
            self.skip_ws();
            if self.eat(b'}') {
                return Ok(Json::Object { entries, at });
            }
            if !self.eat(b',') {
                return Err(self.error("expected ',' or '}'"));
            }
        }
    }

    fn key(&mut self) -> Result<String, JsonError> {
        if matches!(self.peek(), Some(b'"' | b'\'')) {
            return self.string();
        }
        if let Some(name) = self.ident() {
            return Ok(name.into());
        }
        let start = self.pos;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        if self.pos > start {
            return Ok(self.src[start..self.pos].into());
        }
        Err(self.error("expected a key"))
    }

    fn array(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.pos += 1;
        let mut items = Vec::new();
        loop {
            self.skip_ws();
            if self.eat(b']') {
                return Ok(Json::Array(items));
            }
            items.push(self.value(depth + 1)?);
            self.skip_ws();
            if self.eat(b']') {
                return Ok(Json::Array(items));
            }
            if !self.eat(b',') {
                return Err(self.error("expected ',' or ']'"));
            }
        }
    }

    /// A `"` or `'` string; the reader must be on the opening quote.
    pub fn string(&mut self) -> Result<String, JsonError> {
        let quote = self.peek();
        self.pos += 1;
        let mut out = String::new();
        let mut run = self.pos;
        loop {
            match self.peek() {
                None => return Err(self.error("unterminated string")),
                Some(c) if Some(c) == quote => {
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

    fn escape(&mut self) -> Result<char, JsonError> {
        let c = self
            .peek()
            .ok_or_else(|| self.error("unterminated string"))?;
        self.pos += 1;
        Ok(match c {
            b'"' => '"',
            b'\'' => '\'',
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

    fn hex4(&mut self) -> Result<u32, JsonError> {
        let digits = self
            .src
            .get(self.pos..self.pos + 4)
            .filter(|d| d.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or_else(|| self.error("expected four hex digits"))?;
        self.pos += 4;
        Ok(u32::from_str_radix(digits, 16).expect("checked hex digits"))
    }

    /// The pattern ends at the first `/` outside a `[…]` class that is not escaped.
    fn regex(&mut self) -> Result<Json, JsonError> {
        let at = self.pos;
        self.pos += 1;
        let start = self.pos;
        let mut in_class = false;
        loop {
            match self.peek() {
                None | Some(b'\n' | b'\r') => {
                    return Err(self.error_at("unterminated regular expression", at))
                }
                Some(b'\\') => {
                    self.pos += 1;
                    if matches!(self.peek(), None | Some(b'\n' | b'\r')) {
                        return Err(self.error_at("unterminated regular expression", at));
                    }
                    self.pos += 1;
                }
                Some(b'[') => {
                    in_class = true;
                    self.pos += 1;
                }
                Some(b']') => {
                    in_class = false;
                    self.pos += 1;
                }
                Some(b'/') if !in_class => break,
                Some(_) => self.pos += 1,
            }
        }
        let pattern = self.src[start..self.pos].to_string();
        self.pos += 1;
        let mut flags: Vec<char> = Vec::new();
        while let Some(c) = self.peek().filter(u8::is_ascii_alphanumeric) {
            if !REGEX_FLAGS.contains(c as char) {
                return Err(self.error(&format!(
                    "regular expression flag '{}' is not supported; use i, l, m, s, u or x",
                    c as char
                )));
            }
            flags.push(c as char);
            self.pos += 1;
        }
        // BSON requires the options in alphabetical order.
        flags.sort_unstable();
        flags.dedup();
        Ok(Json::Regex {
            pattern,
            flags: flags.into_iter().collect(),
            at,
        })
    }

    fn number(&mut self) -> Result<Json, JsonError> {
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
        Ok(Json::Number {
            text: self.src[start..self.pos].to_string(),
            at: start,
        })
    }

    fn digits(&mut self) {
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
    }

    fn required_digits(&mut self) -> Result<(), JsonError> {
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

    fn num(text: &str, at: usize) -> Json {
        Json::Number {
            text: text.into(),
            at,
        }
    }

    #[test]
    fn keeps_key_order_and_number_text() {
        assert_eq!(
            parse(r#"{"b": 1.50, "a": [-0, 2E+3]}"#).unwrap(),
            Json::Object {
                entries: vec![
                    ("b".into(), num("1.50", 6)),
                    (
                        "a".into(),
                        Json::Array(vec![num("-0", 18), num("2E+3", 22)])
                    ),
                ],
                at: 0,
            }
        );
    }

    #[test]
    fn errors_name_the_position() {
        let text = "{\n  \"a\" 1\n}";
        let err = parse(text).unwrap_err();
        assert_eq!(err.message, "expected ':'");
        assert_eq!(line_column(text, err.at), (2, 7));
    }

    #[test]
    fn rejects_runaway_nesting() {
        assert!(parse(&"[".repeat(MAX_DEPTH + 2)).is_err());
    }

    #[test]
    fn shell_literals() {
        assert_eq!(
            parse("{a: 'x', 1: [2,], /* c */ $b: f(1,)} // end").unwrap(),
            Json::Object {
                entries: vec![
                    ("a".into(), Json::String("x".into())),
                    ("1".into(), Json::Array(vec![num("2", 13)])),
                    (
                        "$b".into(),
                        Json::Call {
                            name: "f".into(),
                            args: vec![num("1", 32)],
                            at: 30,
                        }
                    ),
                ],
                at: 0,
            }
        );
        assert_eq!(
            parse("/a\\/[/]/xi").unwrap(),
            Json::Regex {
                pattern: "a\\/[/]".into(),
                flags: "ix".into(),
                at: 0,
            }
        );
    }
}
