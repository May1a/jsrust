type MyInt = i32;
type Wrapper<T> = Option<T>;

fn add(a: MyInt, b: MyInt) -> MyInt {
    a + b
}

fn unwrap_or_zero(value: Wrapper<i32>) -> i32 {
    match value {
        Some(v) => v,
        None => 0,
    }
}

fn main() -> i32 {
    add(unwrap_or_zero(Some(20)), 22)
}
