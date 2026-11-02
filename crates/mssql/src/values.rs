use chrono::{Duration, NaiveDate, NaiveTime};
use serde_json::{Map, Value as Json};
use tiberius::time::{Date, DateTime, DateTime2, DateTimeOffset, SmallDateTime};
use tiberius::xml::XmlData;
use tiberius::{Column, ColumnData, ColumnType, Row};

pub fn row_object(row: &Row) -> Json {
    let mut map = Map::new();
    for (column, data) in row.cells() {
        map.insert(column.name().to_string(), cell_json(column, data));
    }
    Json::Object(map)
}

pub fn cell_json(column: &Column, data: &ColumnData<'_>) -> Json {
    match column.column_type() {
        ColumnType::Udt => tagged("udt", data),
        ColumnType::SSVariant => tagged("sql_variant", data),
        ColumnType::Money | ColumnType::Money4 => money_json(data),
        _ => value_json(data),
    }
}

pub fn cell_string(data: &ColumnData<'_>) -> Option<String> {
    match value_json(data) {
        Json::Null => None,
        Json::String(text) => Some(text),
        other => Some(other.to_string()),
    }
}

fn tagged(kind: &str, data: &ColumnData<'_>) -> Json {
    let mut map = Map::new();
    map.insert("type".into(), Json::String(kind.into()));
    map.insert("value".into(), value_json(data));
    Json::Object(map)
}

fn money_json(data: &ColumnData<'_>) -> Json {
    match data {
        ColumnData::F64(Some(value)) => Json::String(format!("{value:.4}")),
        ColumnData::F64(None) | ColumnData::F32(None) => Json::Null,
        other => value_json(other),
    }
}

fn value_json(data: &ColumnData<'_>) -> Json {
    match data {
        ColumnData::U8(None)
        | ColumnData::I16(None)
        | ColumnData::I32(None)
        | ColumnData::I64(None)
        | ColumnData::F32(None)
        | ColumnData::F64(None)
        | ColumnData::Bit(None)
        | ColumnData::String(None)
        | ColumnData::Guid(None)
        | ColumnData::Binary(None)
        | ColumnData::Numeric(None)
        | ColumnData::Xml(None)
        | ColumnData::DateTime(None)
        | ColumnData::SmallDateTime(None)
        | ColumnData::Time(None)
        | ColumnData::Date(None)
        | ColumnData::DateTime2(None)
        | ColumnData::DateTimeOffset(None) => Json::Null,
        ColumnData::U8(Some(value)) => Json::from(*value),
        ColumnData::I16(Some(value)) => Json::from(*value),
        ColumnData::I32(Some(value)) => Json::from(*value),
        ColumnData::I64(Some(value)) => Json::from(*value),
        ColumnData::F32(Some(value)) => json_float(f64::from(*value)),
        ColumnData::F64(Some(value)) => json_float(*value),
        ColumnData::Bit(Some(value)) => Json::from(*value),
        ColumnData::String(Some(value)) => Json::String(value.to_string()),
        ColumnData::Guid(Some(value)) => Json::String(value.to_string()),
        ColumnData::Binary(Some(value)) => Json::String(hex_literal(value)),
        ColumnData::Numeric(Some(value)) => Json::String(format_numeric(*value)),
        ColumnData::Xml(Some(value)) => Json::String(xml_text(value.as_ref())),
        ColumnData::DateTime(Some(value)) => Json::String(format_datetime(*value)),
        ColumnData::SmallDateTime(Some(value)) => Json::String(format_smalldatetime(*value)),
        ColumnData::Time(Some(value)) => {
            Json::String(format_time(value.increments(), value.scale()))
        }
        ColumnData::Date(Some(value)) => Json::String(format_date(*value)),
        ColumnData::DateTime2(Some(value)) => Json::String(format_datetime2(*value)),
        ColumnData::DateTimeOffset(Some(value)) => Json::String(format_offset(*value)),
    }
}

fn json_float(value: f64) -> Json {
    serde_json::Number::from_f64(value)
        .map(Json::Number)
        .unwrap_or(Json::Null)
}

fn xml_text(value: &XmlData) -> String {
    value.as_ref().to_string()
}

fn format_numeric(value: tiberius::numeric::Numeric) -> String {
    let negative = value.value() < 0;
    let scale = usize::from(value.scale());
    let mut digits = value.value().unsigned_abs().to_string();
    if digits.len() <= scale {
        digits = format!("{}{digits}", "0".repeat(scale + 1 - digits.len()));
    }
    let split = digits.len() - scale;
    let (whole, fraction) = digits.split_at(split);
    let text = if scale == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{fraction}")
    };
    if negative {
        format!("-{text}")
    } else {
        text
    }
}

fn hex_literal(bytes: &[u8]) -> String {
    let mut text = String::from("0x");
    for byte in bytes {
        text.push_str(&format!("{byte:02X}"));
    }
    text
}

/// Days are counted from 1 January 0001.
pub fn format_date(date: Date) -> String {
    let base = NaiveDate::from_ymd_opt(1, 1, 1).expect("year 1");
    base.checked_add_signed(Duration::days(i64::from(date.days())))
        .map(|day| day.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| date.days().to_string())
}

/// `datetime` counts days from 1900-01-01 and time in 1/300ths of a second.
pub fn format_datetime(value: DateTime) -> String {
    let day = NaiveDate::from_ymd_opt(1900, 1, 1)
        .expect("1900")
        .checked_add_signed(Duration::days(i64::from(value.days())));
    let ticks = u64::from(value.seconds_fragments());
    let seconds = ticks / 300;
    let millis = (ticks % 300) * 1000 / 300;
    match (day, clock(seconds, millis)) {
        (Some(day), time) => format!("{day} {time}"),
        (None, time) => time,
    }
}

/// TDS stores `smalldatetime` as days since 1900-01-01 and minutes past midnight.
/// The driver comment on the second field describes `datetime` instead.
pub fn format_smalldatetime(value: SmallDateTime) -> String {
    let day = NaiveDate::from_ymd_opt(1900, 1, 1)
        .expect("1900")
        .checked_add_signed(Duration::days(i64::from(value.days())));
    let minutes = u64::from(value.seconds_fragments());
    let Some(day) = day else {
        return minutes.to_string();
    };
    let time = NaiveTime::from_num_seconds_from_midnight_opt((minutes * 60) as u32, 0)
        .map(|time| time.format("%H:%M:%S").to_string())
        .unwrap_or_default();
    format!("{day} {time}")
}

pub fn format_datetime2(value: DateTime2) -> String {
    format!(
        "{} {}",
        format_date(value.date()),
        format_time(value.time().increments(), value.time().scale())
    )
}

pub fn format_offset(value: DateTimeOffset) -> String {
    let minutes = value.offset();
    let sign = if minutes < 0 { '-' } else { '+' };
    let abs = minutes.unsigned_abs();
    format!(
        "{} {sign}{:02}:{:02}",
        format_datetime2(value.datetime2()),
        abs / 60,
        abs % 60
    )
}

/// `increments` are 10^-scale seconds since midnight.
pub fn format_time(increments: u64, scale: u8) -> String {
    let factor = 10u64.pow(u32::from(scale.min(9)));
    let seconds = increments / factor;
    let fraction = increments % factor;
    let clock = clock(seconds, 0);
    if scale == 0 {
        clock
    } else {
        format!("{clock}.{fraction:0width$}", width = scale as usize)
    }
}

fn clock(seconds: u64, millis: u64) -> String {
    let hh = seconds / 3600;
    let mm = (seconds % 3600) / 60;
    let ss = seconds % 60;
    if millis == 0 {
        format!("{hh:02}:{mm:02}:{ss:02}")
    } else {
        format!("{hh:02}:{mm:02}:{ss:02}.{millis:03}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tiberius::numeric::Numeric;
    use tiberius::time::Time;
    use uuid::Uuid;

    #[test]
    fn scalars_become_json() {
        assert_eq!(value_json(&ColumnData::Bit(Some(true))), Json::Bool(true));
        assert_eq!(value_json(&ColumnData::I32(None)), Json::Null);
        assert_eq!(
            value_json(&ColumnData::Guid(Some(Uuid::nil()))),
            Json::String("00000000-0000-0000-0000-000000000000".into())
        );
        assert_eq!(
            value_json(&ColumnData::Binary(Some(vec![0x0A, 0xFF].into()))),
            Json::String("0x0AFF".into())
        );
        assert_eq!(
            value_json(&ColumnData::Numeric(Some(Numeric::new_with_scale(
                12345, 2
            )))),
            Json::String("123.45".into())
        );
        assert_eq!(
            value_json(&ColumnData::Numeric(Some(Numeric::new_with_scale(-45, 2)))),
            Json::String("-0.45".into())
        );
        assert_eq!(
            value_json(&ColumnData::Xml(Some(std::borrow::Cow::Owned(
                XmlData::new("<a/>")
            )))),
            Json::String("<a/>".into())
        );
    }

    #[test]
    fn dates_use_the_engine_epochs() {
        assert_eq!(format_date(Date::new(0)), "0001-01-01");
        assert_eq!(format_datetime(DateTime::new(0, 0)), "1900-01-01 00:00:00");
        assert_eq!(
            format_datetime(DateTime::new(0, 300)),
            "1900-01-01 00:00:01"
        );
        assert_eq!(
            format_smalldatetime(SmallDateTime::new(0, 61)),
            "1900-01-01 01:01:00"
        );
        assert_eq!(format_time(10_000_000, 7), "00:00:01.0000000");
        let offset = DateTimeOffset::new(DateTime2::new(Date::new(0), Time::new(0, 0)), -180);
        assert_eq!(format_offset(offset), "0001-01-01 00:00:00 -03:00");
    }
}
